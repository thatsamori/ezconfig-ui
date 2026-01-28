'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeaponConfigTab } from "@/components/weapons";
import { CharacterConfigTab } from "@/components/character";
import { PresetsTab } from "@/components/presets";
import { UsersTab } from "@/components/users";
import { ActionButtons } from "@/components/ActionButtons";
import { AuthGate } from "@/components/auth";
import { useAuthStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

function AppContent() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-2xl font-bold">EZConfig</h1>
          <div className="flex items-center gap-4">
            <ActionButtons />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{user?.username}</span>
              <Button variant="outline" size="sm" onClick={logout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <Tabs defaultValue="weapons" className="flex-1 flex flex-col">
        {/* Sticky tabs */}
        <div className="sticky top-[57px] z-40 bg-background border-b">
          <div className="container mx-auto px-4 py-2">
            <TabsList>
              <TabsTrigger value="weapons">Weapons</TabsTrigger>
              <TabsTrigger value="character">Character</TabsTrigger>
              <TabsTrigger value="presets">Presets</TabsTrigger>
              {user?.role === 'admin' && (
                <TabsTrigger value="users">Users</TabsTrigger>
              )}
            </TabsList>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 container mx-auto px-4 py-4">
          <TabsContent value="weapons" className="mt-0">
            <WeaponConfigTab />
          </TabsContent>
          <TabsContent value="character" className="mt-0">
            <CharacterConfigTab />
          </TabsContent>
          <TabsContent value="presets" className="mt-0">
            <PresetsTab />
          </TabsContent>
          {user?.role === 'admin' && (
            <TabsContent value="users" className="mt-0">
              <UsersTab />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </main>
  );
}

export default function Home() {
  return (
    <AuthGate>
      <AppContent />
    </AuthGate>
  );
}
