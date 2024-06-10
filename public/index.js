document.addEventListener('DOMContentLoaded', (event) => {
    const modal = document.getElementById("myPopup");
    const btn = document.getElementById("openPopup");
    const span = document.getElementsByClassName("close")[0];
    const stars = document.querySelectorAll('.stars_container_input i');
    const ratingInput = document.getElementById('rating');

    btn.onclick = function() {
      modal.style.display = "block";
    }

    span.onclick = function() {
      modal.style.display = "none";
    }

    window.onclick = function(event) {
      if (event.target == modal) {
        modal.style.display = "none";
      }
    }

    stars.forEach(star => {
        star.addEventListener('click', () => {
            const ratingValue = star.getAttribute('data-value');
            ratingInput.value = ratingValue;

            stars.forEach((s, index) => {
                if (index < ratingValue) {
                    s.classList.remove('bi-star');
                    s.classList.add('bi-star-fill');
                } else {
                    s.classList.remove('bi-star-fill');
                    s.classList.add('bi-star');
                }
            });
        });

        star.addEventListener('mouseover', () => {
            const ratingValue = star.getAttribute('data-value');
            stars.forEach((s, index) => {
                if (index < ratingValue) {
                    s.classList.add('bi-star-fill');
                    s.classList.remove('bi-star');
                }
            });
        });

        star.addEventListener('mouseout', () => {
            const ratingValue = ratingInput.value;
            stars.forEach((s, index) => {
                if (index >= ratingValue) {
                    s.classList.add('bi-star');
                    s.classList.remove('bi-star-fill');
                }
            });
        });
    });
});
