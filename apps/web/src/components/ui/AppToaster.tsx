import { Toaster } from "sonner";
import "./AppToaster.css";

export default function AppToaster() {
  return (
    <Toaster
      position="bottom-center"
      duration={3200}
      visibleToasts={3}
      closeButton={false}
      richColors={false}
      expand={false}
      gap={8}
    />
  );
}
