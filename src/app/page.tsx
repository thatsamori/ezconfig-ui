import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeaponConfigTab } from "@/components/weapons";
import { CharacterConfigTab } from "@/components/character";
import { ConfigLoader } from "@/components/ConfigLoader";
import { ApplyChangesButton } from "@/components/ApplyChangesButton";

export default function Home() {
  return (
    <ConfigLoader>
      <main className="container mx-auto p-4">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">EZConfig</h1>
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
    </ConfigLoader>
  );
}
