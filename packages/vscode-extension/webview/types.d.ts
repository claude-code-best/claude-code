declare module "*.css" {
  const content: string;
  export default content;
}

declare module "react-dom/client" {
  import { ReactNode } from "react";
  interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }
  export function createRoot(container: Element): Root;
  export function hydrateRoot(container: Element, children: ReactNode): Root;
}
