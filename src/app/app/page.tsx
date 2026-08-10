import { AppShell } from "@/components/app-shell";
import { PopoverDismissController } from "@/components/popover-dismiss-controller";

export default function WorkspacePage() {
  return (
    <>
      <PopoverDismissController />
      <AppShell />
    </>
  );
}
