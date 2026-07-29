/**
 * Minimal local typings for react-test-renderer (the package ships no types
 * for React 19 and @types/react-test-renderer is not installed).
 * Covers only the API surface used by our component smoke tests.
 */
declare module "react-test-renderer" {
  import type { ReactElement } from "react";

  export interface ReactTestInstance {
    type: string | Function;
    props: { [prop: string]: any };
    children: Array<ReactTestInstance | string>;
    findByType(type: any): ReactTestInstance;
    findAllByType(
      type: any,
      options?: { deep?: boolean }
    ): ReactTestInstance[];
    findByProps(props: { [prop: string]: any }): ReactTestInstance;
    findAllByProps(
      props: { [prop: string]: any },
      options?: { deep?: boolean }
    ): ReactTestInstance[];
  }

  export interface ReactTestRenderer {
    root: ReactTestInstance;
    toJSON(): unknown;
    unmount(): void;
    update(element: ReactElement): void;
  }

  export function act(callback: () => void | Promise<void>): Promise<void> | void;

  function create(element: ReactElement): ReactTestRenderer;

  const TestRenderer: { create: typeof create; act: typeof act };
  export { create };
  export default TestRenderer;
}
