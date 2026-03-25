// Romantic quotes shown randomly in the chat header
export const romanticQuotes = [
  "Every love story is beautiful, but ours is my favorite. 💕",
  "You are my today and all of my tomorrows. 🌹",
  "In a sea of people, my eyes will always search for you. 💫",
  "I love you more than words can say. ❤️",
  "You make my heart smile. 😊💗",
  "Home is wherever I'm with you. 🏡💕",
  "You are the best thing that's ever been mine. 🌸",
  "I choose you. And I'll choose you over and over. 💝",
  "You had me at hello. 💌",
  "My favorite place is inside your hug. 🤗❤️",
];

export const getRandomQuote = () =>
  romanticQuotes[Math.floor(Math.random() * romanticQuotes.length)];
