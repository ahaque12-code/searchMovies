function parseMarkdown(text) {
    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return html
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^\* (.*$)/gim, '<li>$1</li>')
        .replace(/\n/g, '<br>');
}

function scrollGrid(gridId, amount) {
    const grid = document.getElementById(gridId);
    if (grid) {
        grid.scrollBy({ left: amount, behavior: 'smooth' });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // 1.Genre Box
    const genreBtn = document.getElementById("genreBtn");
    const genreBox = document.getElementById("genreBox");
    const checkboxes = document.querySelectorAll("#genreBox input[type='checkbox']");
    const selectedGenresInput = document.getElementById("selectedGenres");

    // Toggle visibility 
    if (genreBtn && genreBox) {
        genreBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            genreBox.classList.toggle("hidden");
        });
        
        document.addEventListener("click", (e) => {
            if (!genreBox.contains(e.target) && e.target !== genreBtn) {
                genreBox.classList.add("hidden");
            }
        });
    }

    // Sync checkboxes, hidden input, and button text
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener("change", () => {
            const selected = Array.from(checkboxes)
                .filter(i => i.checked)
                .map(i => i.value);
            
            // Update the hidden input for the form submission
            selectedGenresInput.value = selected.join(",");
            
            // Update the button text
            if (selected.length > 0) {
                genreBtn.textContent = selected.join(", ");
            } else {
                genreBtn.textContent = "Select Genre";
            }
        });
    });

    // 2. Typewriter Logic
    const input = document.getElementById("movieName");
    if (input) {
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
        type();
    }

    // 3. Autocomplete Logic
    const suggestionsBox = document.getElementById('suggestionsBox');
    function debounce(func, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

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
                    <img src="${`https://image.tmdb.org/t/p/w92${movie.poster_path}`}" alt="${movie.title}" style="width: 60px; height: 80px; margin-right: 10px; border-radius: 2px;">
                    ${movie.title} (${movie.media_type === 'tv' ? 'TV' : 'Movie'})
                </div>`
            ).join('');
        }, 300));
    }

    document.addEventListener('click', (e) => {
        const input = document.getElementById('movieName');
        const suggestionsBox = document.getElementById('suggestionsBox');

        if (e.target !== input && !suggestionsBox.contains(e.target)) {
            suggestionsBox.innerHTML = '';
        }
    });

    // 4. Hamburger Menu Logic
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

});

