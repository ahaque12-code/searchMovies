const genreBtn = document.querySelector("#genreBtn");
const genreBox = document.querySelector("#genreBox");
const selectedGenresInput = document.querySelector("#selectedGenres");

genreBtn.addEventListener("click", () => {
  genreBox.classList.toggle("hidden");
});

genreBox.addEventListener("change", () => {
  const selected = Array.from(
    genreBox.querySelectorAll("input[type='checkbox']:checked")
  ).map(box => box.value);

  selectedGenresInput.value = selected.join(",");

  genreBtn.textContent =
    selected.length > 0 ? selected.join(", ") : "Select Genre";
});