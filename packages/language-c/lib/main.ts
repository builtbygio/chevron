declare const atom: {
  grammars: {
    addInjectionPoint(
      scopeName: string,
      point: {
        type: string;
        language: (node: any) => string | undefined;
        content: (node: any) => any;
        includeChildren?: boolean;
      }
    ): void;
  };
};

export function activate(): void {
  for (const language of ['c', 'cpp']) {
    for (const nodeType of ['preproc_def', 'preproc_function_def']) {
      chevron.grammars.addInjectionPoint(`source.${language}`, {
        type: nodeType,
        language() {
          return language;
        },
        content(node) {
          return node.lastNamedChild;
        }
      });
    }
  }
}
