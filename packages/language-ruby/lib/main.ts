declare const atom: {
  grammars: {
    addInjectionPoint?: (
      scopeName: string,
      point: {
        type: string;
        language: (node?: any) => string | undefined;
        content: (node: any) => any;
      }
    ) => void;
  };
};

export function activate(): void {
  if (!chevron.grammars.addInjectionPoint) return;

  chevron.grammars.addInjectionPoint('source.ruby', {
    type: 'heredoc_body',
    language(node) {
      return node.lastChild.text;
    },
    content(node) {
      return node;
    }
  });

  chevron.grammars.addInjectionPoint('source.ruby', {
    type: 'regex',
    language() {
      return 'regex';
    },
    content(node) {
      return node;
    }
  });
}
