export function populateQuizLevels(fieldset, orderedValues, formatLabel, accessibleLabel = formatLabel) {
  const choices = fieldset.querySelector(".vocab-levels");
  const selectedValue = choices.querySelector("input:checked")?.value || "";
  const all = choices.firstElementChild;
  const options = orderedValues.map(value => {
    const option = all.cloneNode(true);
    const input = option.querySelector("input");
    input.value = value;
    input.defaultChecked = false;
    input.checked = value === selectedValue;
    input.setAttribute("aria-label", accessibleLabel(value));
    option.querySelector("b").textContent = formatLabel(value);
    return option;
  });
  choices.replaceChildren(all, ...options);
  all.querySelector("input").checked = !orderedValues.includes(selectedValue);
}
