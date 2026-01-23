import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { WeaponConfigTab } from "@/components/weapons";
import { CharacterConfigTab } from "@/components/character";

export default function Home() {
  return (
    <main className="container mx-auto p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">EZConfig</h1>
        <Button>Apply Changes</Button>
      </header>

      <Tabs defaultValue="weapons" className="w-full">
        <TabsList>
          <TabsTrigger value="weapons">Weapons</TabsTrigger>
          <TabsTrigger value="character">Character</TabsTrigger>
        </TabsList>
        <TabsContent value="weapons">
          <WeaponConfigTab />
        </TabsContent>
        <TabsContent value="character">
          <CharacterConfigTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}
