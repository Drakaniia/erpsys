// Remotion serves public assets beneath a bundle prefix, unlike Vite's origin root.
// Import the original icons into the film bundle without changing the production component.
module.exports = function (source) {
  return source.replace(
    /src="\/images\/(progress|ai_chat)\.webp"/g,
    (_, icon) =>
      `src={new URL('../../../public/images/${icon}.webp',import.meta.url).href}`,
  );
};
