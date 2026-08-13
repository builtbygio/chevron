declare const atom: {
  grammars: {
    addInjectionPoint(
      scopeName: string,
      point: {
        type: string;
        language: () => string;
        content: (node: any) => any;
        includeChildren?: boolean;
      }
    ): void;
  };
};

export function activate(): void {
  for (const nodeType of ['macro_invocation', 'macro_rule']) {
    atom.grammars.addInjectionPoint('source.rust', {
      type: nodeType,
      language() {
        return 'rust';
      },
      content(node) {
        return node.lastChild;
      },
      includeChildren: true
    });
  }
}
