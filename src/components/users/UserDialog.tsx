"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/store";
import type { UserRole } from "@/lib/auth/types";

interface UserInfo {
  username: string;
  role: UserRole;
}

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserInfo | null;
  onSaved: () => void;
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: "viewer", label: "Viewer" },
  { value: "preset_creator", label: "Preset Creator" },
  { value: "config_editor", label: "Config Editor" },
  { value: "global_admin", label: "Global Admin" },
];

export function UserDialog({ open, onOpenChange, user, onSaved }: UserDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [isSaving, setIsSaving] = useState(false);

  const token = useAuthStore((state) => state.token);
  const isEditMode = !!user;

  // Reset form when dialog opens/closes or user changes
  useEffect(() => {
    if (open) {
      if (user) {
        setUsername(user.username);
        setRole(user.role);
        setPassword(""); // Don't show existing password
      } else {
        setUsername("");
        setPassword("");
        setRole("viewer");
      }
    }
  }, [open, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    // Validation
    if (!username.trim()) {
      toast.error("Username is required", { position: "bottom-right" });
      return;
    }

    if (!isEditMode && !password.trim()) {
      toast.error("Password is required for new users", { position: "bottom-right" });
      return;
    }

    setIsSaving(true);
    try {
      const body: Record<string, string> = { role };

      if (!isEditMode) {
        // Create mode: include username and password
        body.username = username.trim();
        body.password = password;
      } else if (password.trim()) {
        // Edit mode: only include password if provided
        body.password = password;
      }

      const url = isEditMode ? `/api/users/${user.username}` : "/api/users";
      const method = isEditMode ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${isEditMode ? "update" : "create"} user`);
      }

      toast.success(
        isEditMode ? `Updated user: ${user.username}` : `Created user: ${username}`,
        { position: "bottom-right" }
      );

      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Failed to ${isEditMode ? "update" : "create"} user`,
        { position: "bottom-right" }
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit User" : "Create User"}</DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update user role or password. Leave password blank to keep current."
                : "Create a new user with username, password, and role."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                disabled={isEditMode}
                autoComplete="off"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">
                Password {isEditMode && "(leave blank to keep current)"}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEditMode ? "Enter new password" : "Enter password"}
                autoComplete="new-password"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : isEditMode ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
