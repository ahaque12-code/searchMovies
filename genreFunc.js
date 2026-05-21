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

const input = document.getElementById("movieName");
const phrases = [
    "Search movies...", 
    "Search TV shows...", 
];

let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;
let typeSpeed = 100;

function type() {
    const currentPhrase = phrases[phraseIndex];
    
    if (isDeleting) {
      input.placeholder = currentPhrase.substring(0, charIndex - 1);
      charIndex--;
      typeSpeed = 50;
    } else {
      input.placeholder = currentPhrase.substring(0, charIndex + 1);
      charIndex++;
      typeSpeed = 100;
    }

    if (!isDeleting && charIndex === currentPhrase.length) {
      isDeleting = true;
      typeSpeed = 2000; 
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      typeSpeed = 500;
    }

    setTimeout(type, typeSpeed);
  }

  
window.onload = type;

