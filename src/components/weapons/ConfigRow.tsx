"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  BooleanInput,
  FloatInput,
  VectorInput,
  Vector2DInput,
  FloatArrayInput,
  StringSelectInput,
} from "@/components/config";
import { NotesDialog } from "@/components/notes";
import { ConfigEntry, DataType } from "@/lib/config/types";
import type { ConfigValue } from "@/lib/store/configStore";
import { useNotes } from "@/lib/hooks";
import { getSchemaFromDatabase } from "@/lib/notes/types";
import { Pencil, X, MessageCircle } from "lucide-react";
import { ExplicitFloatOverride } from "@/components/config/ExplicitFloatOverride";
import { defaultLabel, defaultDetails, resolveDefault } from "@/lib/config/defaults";

export interface ConfigRowProps {
  configEntry: ConfigEntry;
  database: string;
  category: string;
  value: ConfigValue | undefined;
  onChange: (value: ConfigValue) => void;
  onReset?: () => void;
  onApplyToAll?: () => void;
  disabled?: boolean;
  readonly?: boolean;
  /**
   * Grey the whole row (a feature parameter whose feature toggle is off).
   * Visual only: the value stays stored and is still sent.
   */
  muted?: boolean;
}

export function ConfigRow({
  configEntry,
  database,
  category,
  value,
  onChange,
  onReset,
  onApplyToAll,
  disabled,
  readonly,
  muted,
}: ConfigRowProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [editingUnset, setEditingUnset] = useState(false);
  const isCustomized = value !== undefined && value !== null;
  const baseline = resolveDefault(configEntry, database, category).defaultValue;

  // Derive schema from database path (e.g., "Weapon/Greatsword" -> "weapon")
  const schema = getSchemaFromDatabase(database);

  const {
    notes,
    loading: notesLoading,
    addNote,
    editNote,
    deleteNote,
    currentUsername,
  } = useNotes({
    schema,
    configKey: configEntry.configKey,
  });

  const hasNotes = notes.length > 0;

  const handleEdit = () => {
    if ((configEntry.requiresExplicitValue || configEntry.defaultVariesByMotion) && configEntry.dataType === DataType.Float) {
      setEditingUnset(true);
      return;
    }
    // When clicking Edit, set to the schema default value
    const defaultValue = baseline;
    if (defaultValue !== undefined) {
      onChange(structuredClone(defaultValue) as ConfigValue);
    }
  };

  const renderInput = () => {
    // Value is guaranteed to exist here (only called when isCustomized)
    switch (configEntry.dataType) {
      case DataType.Bool:
        return (
          <BooleanInput
            value={value as boolean}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case DataType.Float:
        return (
          <FloatInput
            value={value as number}
            onChange={onChange}
            disabled={disabled}
            min={configEntry.minimum}
          />
        );
      case DataType.Vector:
        return (
          <VectorInput
            value={value as { x: number; y: number; z: number }}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case DataType.Vector2D:
        return (
          <Vector2DInput
            value={value as { x: number; y: number }}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case DataType.FloatArray:
        return (
          <FloatArrayInput
            value={value as number[]}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case DataType.String:
        return (
          <StringSelectInput
            value={value as string}
            choices={configEntry.choices ?? [String(baseline)]}
            onChange={onChange}
            disabled={disabled}
          />
        );
      default:
        return <span className="text-muted-foreground">Unknown type</span>;
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`flex items-center gap-4 py-2 border-b border-border last:border-b-0${
              muted ? " opacity-50" : ""
            }`}
            title={
              muted
                ? "Feature parameter: stored and sent, but only read while the feature toggle is on."
                : undefined
            }
          >
            <div className="min-w-[200px] flex items-center gap-1">
              <Label
                className="font-medium"
                title={configEntry.documentation || undefined}
              >
                {configEntry.configKey}
              </Label>
              {hasNotes && !notesLoading && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setNotesOpen(true)}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  title={`${notes.length} note${notes.length > 1 ? "s" : ""}`}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <Badge
                    variant="secondary"
                    className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 px-0.5 text-[9px] flex items-center justify-center"
                  >
                    {notes.length}
                  </Badge>
                </Button>
              )}
            </div>
            <div className="flex-1 flex items-center gap-2">
              {isCustomized ? (
                <>
                  {renderInput()}
                  {onReset && !readonly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onReset}
                      disabled={disabled}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Reset to game default"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </>
              ) : editingUnset && !readonly ? (
                <ExplicitFloatOverride
                  configKey={configEntry.configKey}
                  disabled={disabled}
                  onConfirm={(newValue) => {
                    onChange(newValue);
                    setEditingUnset(false);
                  }}
                  onCancel={() => setEditingUnset(false)}
                />
              ) : (
                <>
                  <Badge variant="secondary" className="text-xs" title={defaultDetails(configEntry, database, category)}>
                    {defaultLabel(configEntry, database, category)}
                  </Badge>
                  {!readonly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleEdit}
                      disabled={disabled}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      title="Customize value"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setNotesOpen(true)}>
            {hasNotes ? `View notes (${notes.length})` : "Add note"}
          </ContextMenuItem>
          {onApplyToAll && !readonly && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={onApplyToAll}>
                {isCustomized ? "Apply to all weapons" : "Reset all to default"}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <NotesDialog
        open={notesOpen}
        onOpenChange={setNotesOpen}
        configKey={configEntry.configKey}
        notes={notes}
        onAddNote={addNote}
        onEditNote={editNote}
        onDeleteNote={deleteNote}
        currentUsername={currentUsername}
      />
    </>
  );
}
