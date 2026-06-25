/**
 * Decorative recipe-journal backdrop for the home hero.
 *
 * Renders a ring of handwritten "recipe cards" around the centered welcome +
 * search. Light mode = warm cream paper with red ruled accents; dark mode =
 * a chalkboard treatment (slate cards, chalk-white handwriting). The whole
 * layer is radially masked so it fades to nothing behind the center, keeping
 * the foreground content fully legible.
 *
 * Data: when the page passes in `recipes` (the user's own, shuffled per load),
 * those fill the cards — title + ingredient names only, no quantities/units.
 * Otherwise the seeded DEFAULT_RECIPES are used.
 *
 * Purely ambient: pointer-events-none, aria-hidden, sits behind the content.
 */

type Complexity = "EASY" | "MEDIUM" | "HARD" | "NONE";

export type JournalRecipe = {
  title: string;
  /** Ingredient names only — no quantities or units. */
  ingredients: string[];
  complexity?: Complexity | null;
  servings?: number | null;
};

type Slot = {
  /** Tailwind positioning + rotation for this card */
  position: string;
  width: string;
  /** Footer style: a "Serves N" meta line, or the Difficulty checkbox block */
  deco: "meta" | "difficulty";
  /** Hide on small screens to avoid crowding */
  hideOnMobile?: boolean;
};

// Eight slots arranged in a ring around the center, so the collage frames the
// welcome text rather than sitting behind it. Card N uses slot N.
const SLOTS: Slot[] = [
  { position: "left-[2%] top-[7%] -rotate-6",        width: "w-60", deco: "meta" },
  { position: "left-[26%] top-[2%] -rotate-2",       width: "w-52", deco: "difficulty", hideOnMobile: true },
  { position: "right-[26%] top-[2%] rotate-2",       width: "w-52", deco: "meta",       hideOnMobile: true },
  { position: "right-[3%] top-[6%] rotate-[5deg]",   width: "w-64", deco: "difficulty" },
  { position: "left-[4%] top-[45%] rotate-[4deg]",   width: "w-56", deco: "meta",       hideOnMobile: true },
  { position: "right-[4%] top-[44%] -rotate-[5deg]", width: "w-60", deco: "difficulty", hideOnMobile: true },
  { position: "left-[15%] bottom-[5%] -rotate-[3deg]", width: "w-56", deco: "meta",     hideOnMobile: true },
  { position: "right-[15%] bottom-[6%] rotate-[6deg]", width: "w-56", deco: "difficulty", hideOnMobile: true },
];

// Each default card has a unique, coherent ingredient set — no rice-with-pasta
// mixups. Used when the user doesn't have enough recipes of their own yet.
const DEFAULT_RECIPES: JournalRecipe[] = [
  { title: "Lemon Garlic Salmon", ingredients: ["Salmon fillet", "Lemon", "Garlic", "Fresh dill", "Butter"], servings: 2 },
  { title: "Caesar Salad", ingredients: ["Romaine", "Parmesan", "Croutons", "Anchovy", "Lemon"], complexity: "EASY" },
  { title: "Shakshuka", ingredients: ["Eggs", "Plum tomato", "Red pepper", "Onion", "Cumin", "Feta"], servings: 4 },
  { title: "Margherita Pizza", ingredients: ["Pizza dough", "San Marzano tomato", "Fresh mozzarella", "Basil", "Olive oil"], complexity: "MEDIUM" },
  { title: "Thai Green Curry", ingredients: ["Chicken thigh", "Coconut milk", "Green curry paste", "Thai basil", "Lime"], servings: 4 },
  { title: "Banana Bread", ingredients: ["Ripe banana", "Flour", "Brown sugar", "Eggs", "Cinnamon"], complexity: "EASY" },
  { title: "Mushroom Risotto", ingredients: ["Arborio rice", "Cremini mushroom", "Parmesan", "Shallot", "White wine"], servings: 4 },
  { title: "Beef Tacos", ingredients: ["Ground beef", "Corn tortilla", "Red onion", "Cilantro", "Cotija"], complexity: "EASY" },
];

// Notebook ruling behind the ingredient lines — red-tinted on paper, faint
// white chalk on the dark board.
const ruledClasses =
  "bg-[repeating-linear-gradient(to_bottom,transparent,transparent_21px,rgba(216,58,42,0.10)_21px,rgba(216,58,42,0.10)_22px)] " +
  "dark:bg-[repeating-linear-gradient(to_bottom,transparent,transparent_21px,rgba(255,255,255,0.10)_21px,rgba(255,255,255,0.10)_22px)]";

function HerbDoodle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" aria-hidden="true">
      <path d="M2 22C8 18 14 12 26 4" />
      <path d="M22 4c2-1 4-1 4-1s-.5 2-2 3-3 1-3 1M16 9c2-1 4-1 4-1s-.5 2-2 3-3 1-3 1M10 14c2-1 4-1 4-1s-.5 2-2 3-3 1-3 1" />
    </svg>
  );
}

function Checkbox({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span className="relative inline-flex h-3 w-3 items-center justify-center rounded-[2px] border border-[#c9462f] dark:border-white/45">
        {checked && (
          <svg className="h-2.5 w-2.5 text-[#c9462f] dark:text-white/80" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 6.5l2.5 2.5L10 3" />
          </svg>
        )}
      </span>
      {label}
    </span>
  );
}

const complexityLabel: Record<Exclude<Complexity, "NONE">, string> = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };

function JournalCard({ recipe, slot }: { recipe: JournalRecipe; slot: Slot }) {
  const ticked: Complexity = recipe.complexity ?? "MEDIUM";
  return (
    <div
      className={[
        "absolute select-none rounded-md border px-4 py-3",
        "border-[#e4d4b4] bg-[#fbf3e2] shadow-[0_8px_24px_-12px_rgba(80,50,20,0.45)]",
        "dark:border-white/15 dark:bg-[#27302c] dark:shadow-[0_8px_24px_-10px_rgba(0,0,0,0.6)]",
        slot.width,
        slot.position,
        slot.hideOnMobile ? "hidden lg:block" : "",
      ].join(" ")}
    >
      {/* Title — flowing handwriting, with a hand-drawn underline */}
      <div className="flex items-start justify-between gap-2">
        <p className="font-hand-script text-2xl font-bold leading-none text-[#d83a2a] dark:text-[#fdeede]">
          {recipe.title}
        </p>
        <HerbDoodle className="mt-0.5 h-3.5 w-5 flex-shrink-0 text-[#9bbf6a] dark:text-[#9bbf6a]/70" />
      </div>
      <div className="mt-1 h-px w-full bg-[#e6b3aa] dark:bg-white/25" />

      {/* Ingredients on faint ruled lines */}
      <ul className={`mt-2 space-y-[5px] font-hand text-sm leading-[22px] text-[#5b4a36] dark:text-[#e7e2d6] ${ruledClasses}`}>
        {recipe.ingredients.map((ing, i) => (
          <li key={`${ing}-${i}`} className="truncate">{ing}</li>
        ))}
      </ul>

      {/* Footer: meta line or difficulty checkboxes, mirroring the journal look */}
      {slot.deco === "meta" && recipe.servings != null && (
        <p className="mt-2 font-hand text-xs text-[#9a7b52] dark:text-white/50">Serves {recipe.servings}</p>
      )}
      {slot.deco === "difficulty" && (
        <div className="mt-2 flex items-center gap-3 font-hand text-xs text-[#5b4a36] dark:text-[#e7e2d6]">
          {(["EASY", "MEDIUM", "HARD"] as const).map((level) => (
            <Checkbox key={level} label={complexityLabel[level]} checked={ticked === level} />
          ))}
        </div>
      )}
    </div>
  );
}

export function HeroRecipeBackdrop({ recipes }: { recipes?: JournalRecipe[] }) {
  const data = recipes && recipes.length >= SLOTS.length ? recipes : DEFAULT_RECIPES;

  return (
    <div
      aria-hidden="true"
      // Phones are too small for the collage to read well — hide it entirely
      // below the `sm` breakpoint and only render it on larger screens.
      className="pointer-events-none absolute inset-0 hidden overflow-hidden opacity-75 sm:block dark:opacity-[0.55]"
      style={{
        // Fade the collage out toward the center (behind the welcome + search)
        // and gently at the very edges, so it never competes with the content.
        WebkitMaskImage:
          "radial-gradient(ellipse 58% 52% at 50% 46%, transparent 0%, transparent 34%, black 82%)",
        maskImage:
          "radial-gradient(ellipse 58% 52% at 50% 46%, transparent 0%, transparent 34%, black 82%)",
      }}
    >
      {SLOTS.map((slot, i) => (
        <JournalCard key={i} slot={slot} recipe={data[i]} />
      ))}
    </div>
  );
}
