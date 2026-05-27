// --- Typewriter Logic ---
const input = document.getElementById("movieName");
const phrases = ["Search movies...", "Search TV shows..."];
let phraseIndex = 0, charIndex = 0, isDeleting = false, typeSpeed = 100;

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

// --- Autocomplete Logic ---
const suggestionsBox = document.getElementById('suggestionsBox');
function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

document.addEventListener("DOMContentLoaded", () => {
    if (input) type();
    if (input && suggestionsBox) {
        input.addEventListener('input', debounce(async (e) => {
            const query = e.target.value;
            if (query.length < 3) {
                suggestionsBox.innerHTML = '';
                return;
            }
            const response = await fetch('/api/search-suggestions?q=' + encodeURIComponent(query));
            const data = await response.json();
            suggestionsBox.innerHTML = data.map(movie => 
            `<div class="suggestion-item" 
                onclick="window.location.href='/media/${movie.media_type}/${movie.id}'">
                ${movie.title} (${movie.media_type === 'tv' ? 'TV' : 'Movie'})
            </div>`
        ).join('');
        }, 300));
    }
});