import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeaponConfigTab } from "@/components/weapons";
import { CharacterConfigTab } from "@/components/character";
import { ApplyChangesButton } from "@/components/ApplyChangesButton";

export default function Home() {
  return (
    <main className="container mx-auto p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">EZConfig</h1>
        {/* ApplyChangesButton will be updated in Phase 7 */}
        <ApplyChangesButton />
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
