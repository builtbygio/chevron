declare const atom: {
  grammars: {
    addInjectionPoint(
      scopeName: string,
      point: {
        type: string;
        language: (node?: any) => string | undefined;
        content: (node: any) => any;
        newlinesBetween?: boolean;
      }
    ): void;
  };
};

export function activate(): void {
  chevron.grammars.addInjectionPoint('text.html.basic', {
    type: 'script_element',
    language() {
      return 'javascript';
    },
    content(node) {
      return node.child(1);
    }
  });

  chevron.grammars.addInjectionPoint('text.html.basic', {
    type: 'style_element',
    language() {
      return 'css';
    },
    content(node) {
      return node.child(1);
    }
  });

  chevron.grammars.addInjectionPoint('text.html.ejs', {
    type: 'template',
    language() {
      return 'javascript';
    },
    content(node) {
      return node.descendantsOfType('code');
    },
    newlinesBetween: true
  });

  chevron.grammars.addInjectionPoint('text.html.ejs', {
    type: 'template',
    language() {
      return 'html';
    },
    content(node) {
      return node.descendantsOfType('content');
    }
  });

  chevron.grammars.addInjectionPoint('text.html.erb', {
    type: 'template',
    language() {
      return 'ruby';
    },
    content(node) {
      return node.descendantsOfType('code');
    },
    newlinesBetween: true
  });

  chevron.grammars.addInjectionPoint('text.html.erb', {
    type: 'template',
    language() {
      return 'html';
    },
    content(node) {
      return node.descendantsOfType('content');
    }
  });
}
