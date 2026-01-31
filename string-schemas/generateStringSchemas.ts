import { WEAPON_CONFIG_OPTIONS } from "@/lib/config/weaponConfigSchema";
import { CHARACTER_CONFIG_OPTIONS } from "@/lib/config/characterConfigSchema";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path/win32";
import { DataType } from "@/lib/config/types";

const writeWeaponConfigStringSchema = () => {
  let acc = "";

  const options = Object.values(WEAPON_CONFIG_OPTIONS).flat();
  options.forEach((opt) => {
    const isVector =
      opt.dataType === DataType.Vector || opt.dataType === DataType.Vector2D;
    acc += `${opt.configKey},${isVector ? "Vector" : opt.dataType} `;
  });

  // Write to file
  Bun.write("./weaponConfigSchema.txt", acc.trim());
};

const writeCharacterConfigStringSchema = () => {
  let acc = "";

  const options = Object.values(CHARACTER_CONFIG_OPTIONS).flat();
  options.forEach((opt) => {
    const isVector =
      opt.dataType === DataType.Vector || opt.dataType === DataType.Vector2D;
    acc += `${opt.configKey},${isVector ? "Vector" : opt.dataType} `;
  });

  // Write to file
  Bun.write("./characterConfigSchema.txt", acc.trim());
};

writeWeaponConfigStringSchema();
writeCharacterConfigStringSchema();
