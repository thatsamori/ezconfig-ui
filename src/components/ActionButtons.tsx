"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectiveApplyDialog } from "@/components/SelectiveApplyDialog";

export function ActionButtons() {
  const [showApplyDialog, setShowApplyDialog] = useState(false);

  const handleApply = () => {
    setShowApplyDialog(true);
  };

  return (
    <div className="flex items-center gap-2">
      <Button onClick={handleApply} variant="outline">
        Apply to Game
      </Button>

      <SelectiveApplyDialog
        open={showApplyDialog}
        onOpenChange={setShowApplyDialog}
        onApplyComplete={() => {
          // Dialog handles its own success toast
        }}
      />
    </div>
  );
}
