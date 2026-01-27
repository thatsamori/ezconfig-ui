'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeaponConfigTab } from "@/components/weapons";
import { CharacterConfigTab } from "@/components/character";
import { PresetsTab } from "@/components/presets";
import { ActionButtons } from "@/components/ActionButtons";
import { AuthGate } from "@/components/auth";
import { useAuthStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

function AppContent() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <main className="container mx-auto p-4">
      <header className="flex justify-between items-center mb-6">
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
      </header>

      <Tabs defaultValue="weapons" className="w-full">
        <TabsList>
          <TabsTrigger value="weapons">Weapons</TabsTrigger>
          <TabsTrigger value="character">Character</TabsTrigger>
          <TabsTrigger value="presets">Presets</TabsTrigger>
        </TabsList>
        <TabsContent value="weapons">
          <WeaponConfigTab />
        </TabsContent>
        <TabsContent value="character">
          <CharacterConfigTab />
        </TabsContent>
        <TabsContent value="presets">
          <PresetsTab />
        </TabsContent>
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
