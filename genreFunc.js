document.addEventListener("DOMContentLoaded", () => {
    const genreBtn = document.querySelector("#genreBtn");
    const genreBox = document.querySelector("#genreBox");
    const selectedGenresInput = document.querySelector("#selectedGenres");

    if (genreBtn) {
        genreBtn.addEventListener("click", () => genreBox.classList.toggle("hidden"));
        genreBox.addEventListener("change", () => {
            const selected = Array.from(genreBox.querySelectorAll("input[type='checkbox']:checked")).map(box => box.value);
            selectedGenresInput.value = selected.join(",");
            genreBtn.textContent = selected.length > 0 ? selected.join(", ") : "Select Genre";
        });
    }

    const searchInput = document.getElementById('movieName');
    const suggestionsBox = document.getElementById('suggestionsBox');

    if (searchInput && suggestionsBox) {
        searchInput.addEventListener('input', debounce(async (e) => {
            const query = e.target.value;
            if (query.length < 3) {
                suggestionsBox.innerHTML = '';
                return;
            }

            try {
                const response = await fetch('/api/search-suggestions?q=' + encodeURIComponent(query));
                const data = await response.json();

                suggestionsBox.innerHTML = data.map(movie => 
                    `<div class="suggestion-item" onclick="window.location.href='/media/movie/${movie.id}'">${movie.title}</div>`
                ).join('');
            } catch (err) {
                console.error("Suggestion fetch failed", err);
            }
        }, 300));
    }

    function debounce(func, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    const input = document.getElementById("movieName");
    if (input) {
        type();
    }
});