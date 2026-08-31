/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        peruRed: "#A62121",
        peruMustard: "#D8A431",
        bone: "#F8F4EC",
        coffee: "#4A2E1F"
      },
      boxShadow: {
        bento: "0 10px 30px rgba(166, 33, 33, 0.12)"
      }
    }
  },
  plugins: []
};
