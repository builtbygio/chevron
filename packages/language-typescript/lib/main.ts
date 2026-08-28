declare const atom: {
  grammars: {
    addInjectionPoint(
      scopeName: string,
      point: {
        type: string;
        language: (node: any) => string | undefined;
        content: (node: any) => any;
      }
    ): void;
  };
};

export function activate(): void {
  for (const scopeName of ['source.ts', 'source.flow']) {
    chevron.grammars.addInjectionPoint(scopeName, {
      type: 'call_expression',

      language(callExpression) {
        const { firstChild } = callExpression;
        switch (firstChild.type) {
          case 'identifier':
            return languageStringForTemplateTag(firstChild.text);
          case 'member_expression':
            if (firstChild.startPosition.row === firstChild.endPosition.row) {
              return languageStringForTemplateTag(firstChild.text);
            }
        }
      },

      content(callExpression) {
        const { lastChild } = callExpression;
        if (lastChild.type === 'template_string') {
          return lastChild;
        }
      }
    });

    chevron.grammars.addInjectionPoint(scopeName, {
      type: 'assignment_expression',

      language(callExpression) {
        const { firstChild } = callExpression;
        if (firstChild.type === 'member_expression') {
          if (firstChild.lastChild.text === 'innerHTML') {
            return 'html';
          }
        }
      },

      content(callExpression) {
        const { lastChild } = callExpression;
        if (lastChild.type === 'template_string') {
          return lastChild;
        }
      }
    });

    chevron.grammars.addInjectionPoint(scopeName, {
      type: 'regex_pattern',
      language() {
        return 'regex';
      },
      content(regex) {
        return regex;
      }
    });
  }
}

const STYLED_REGEX = /\bstyled\b/i;

function languageStringForTemplateTag(tag: string): string {
  if (STYLED_REGEX.test(tag)) {
    return 'CSS';
  }
  return tag;
}
