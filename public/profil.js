const profileInput = document.querySelectorAll("input");
const profileBtn = document.querySelector(".edit_profile")
const profileSubmit = document.querySelector("#submit");

profileInput.forEach((input) => {
    profileBtn.addEventListener('click', () => {
        input.disabled = false;
        input.style.color = "#000";
        profileSubmit.style.display = "block";
    });
});