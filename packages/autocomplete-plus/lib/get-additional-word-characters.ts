declare const atom: any

const POSSIBLE_WORD_CHARACTERS = '/\\()"\':,.;<>~!@#$%^&*|+=[]{}`?_-…'.split('')

module.exports =
function getAdditionalWordCharacters (scopeDescriptor) {
  const nonWordCharacters = chevron.config.get('editor.nonWordCharacters', {scope: scopeDescriptor})
  let result = chevron.config.get('autocomplete-plus.extraWordCharacters', {scope: scopeDescriptor})
  POSSIBLE_WORD_CHARACTERS.forEach(character => {
    if (!nonWordCharacters.includes(character)) {
      result += character
    }
  })
  return result
}
