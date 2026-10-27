/** Build: npx tailwindcss@3.4.17 -i src/input.css -o style.css --minify */
module.exports = {
  content: ['./*.html'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        cream:    { 50: '#FEFCF3', 100: '#FEF7E7', 200: '#F9EBC8' },
        rose:     { 500: '#E11D74', 600: '#BE185D', 700: '#9F1359' },
        coral:    { 400: '#FB7185', 500: '#F43F5E' },
        ink:      { 900: '#1B1014', 800: '#2D1D24', 700: '#4A2F3A', 600: '#6E4759' }
      }
    }
  }
}
