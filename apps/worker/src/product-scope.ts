/** Owner-directed product scope: every Roblox genre and requested art direction. */
export const PRODUCT_VISUAL_SCOPE = {
  kind: 'all-roblox-genres',
  instruction: `StudPilot supports every Roblox genre and the user's requested art direction. Follow the project's world, UI, characters, props, materials, lighting, animations and effects consistently. Search the owner's supplied corpus first and use owner-attested components with their exact serialized bytes and hierarchy. Preserve downloaded scripts as data until reviewed; never execute them during import. Verify the actual in-game view and gameplay; a code pass is not visual approval.`,
} as const;
