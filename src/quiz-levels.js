export function populateQuizLevels(fieldset, orderedValues, formatLabel) {
  const choices = fieldset.querySelector(".quiz-levels");
  const selectedValue = choices.querySelector("input:checked")?.value || "";
  const all = choices.querySelector(".quiz-level");
  const options = orderedValues.map(value => {
    const option = all.cloneNode(true);
    const input = option.querySelector("input");
    input.value = value;
    input.defaultChecked = false;
    input.checked = value === selectedValue;
    option.querySelector("span").textContent = formatLabel(value);
    return option;
  });
  choices.replaceChildren(all, ...options);
  all.querySelector("input").checked = !orderedValues.includes(selectedValue);
}
