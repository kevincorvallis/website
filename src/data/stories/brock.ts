import { Story } from "@/types/story";

export const brockStory: Story = {
  slug: "brock",
  title: "Brock",
  subtitle: "A year in the life of",
  description:
    "From city sidewalks to coastal cliffs, ER waiting rooms to autumn leaves. One little golden doodle, one very big year.",
  heroImage: "/brock/images/01-prologue-portrait.jpg",
  accent: "#d4a574",
  chapters: [
    {
      number: "Chapter One",
      title: "City Dog",
      tagline:
        "Life in San Francisco. Coffee shops, coding sessions, and couch naps.",
      sections: [
        {
          type: "photo-full",
          src: "/brock/images/02-city-sleepy.jpg",
          caption: "The face of a dog who has fully claimed the couch.",
          location: "San Francisco, CA",
        },
        { type: "spacer", size: "md" },
        {
          type: "photo-grid",
          images: [
            { src: "/brock/images/03-city-coding.jpg", alt: "Brock next to coding setup" },
            { src: "/brock/images/04-city-couch.jpg", alt: "Brock on couch being pet" },
          ],
        },
        {
          type: "text-block",
          content:
            "Every morning, the same routine. Kevin codes. Brock supervises. <strong>The best coworker never sends a Slack message</strong> &mdash; he just nudges your hand when it's time for a walk.",
        },
        { type: "spacer", size: "sm" },
        {
          type: "video-inset",
          src: "/brock/images/brock-hairdryer.mp4",
          poster: "/brock/images/brock-hairdryer-poster.jpg",
        },
        {
          type: "text-block",
          content:
            "Post-bath blowout. <strong>Not a fan of the hair dryer</strong> &mdash; but absolutely a fan of being fluffy.",
        },
      ],
    },
    {
      number: "Chapter Two",
      title: "The Scare",
      tagline: "The late-night drives. The waiting room. The relief.",
      sections: [
        {
          type: "photo-full",
          src: "/brock/images/05-scare-beryl-holding.jpg",
          caption: "Wrapped up safe. Everything's going to be okay.",
          location: "Emergency Vet",
        },
        {
          type: "text-block",
          content:
            "Sterile panniculitis. Words no puppy parent wants to hear. It meant multiple ER visits, sleepless nights, and a kind of fear that made everything else disappear. <strong>It freaked Mom and Dad out &mdash; a lot.</strong> But Dr. Schnabl was a savior, and Brock pulled through. He's been blessed ever since.",
        },
      ],
    },
    {
      number: "Chapter Three",
      title: "Oregon Wild",
      tagline:
        "Coastlines, canoes, wildflowers, and the best camping buddy you could ask for.",
      sections: [
        {
          type: "photo-full",
          src: "/brock/images/06-oregon-canoe.jpg",
          caption: "First mate Brock. Yellow vest, tongue out, ready for anything.",
          location: "Oregon Coast",
        },
        { type: "spacer", size: "md" },
        {
          type: "photo-full",
          src: "/brock/images/07-oregon-coast.jpg",
          caption: "King of the cliff.",
          location: "Pacific Coast",
        },
        { type: "spacer", size: "md" },
        {
          type: "photo-grid",
          images: [
            { src: "/brock/images/08-oregon-hiking-family.jpg", alt: "Family hiking together" },
            { src: "/brock/images/09-oregon-beryl-carry.jpg", alt: "Beryl carrying Brock on trail" },
          ],
        },
        {
          type: "text-block",
          content:
            "When his little legs got tired on the trail, <strong>Beryl carried him like a baby</strong>. He didn't seem to mind one bit.",
        },
        {
          type: "photo-full",
          src: "/brock/images/10-oregon-daisies.jpg",
          caption: "Stop and smell the daisies.",
          location: "Oregon",
        },
        { type: "spacer", size: "md" },
        {
          type: "photo-inset",
          src: "/brock/images/11-oregon-tent.jpg",
        },
        {
          type: "text-block",
          content:
            "Camping with a mini goldendoodle means sharing your sleeping bag, finding fur in your coffee, and waking up to a face that says: <strong>can we do this forever?</strong>",
        },
      ],
    },
    {
      number: "Chapter Four",
      title: "The Big Move",
      tagline:
        "San Francisco → South Bend, Indiana. 2,200 miles. One very good co-pilot.",
      sections: [
        {
          type: "hscroll-strip",
          images: [
            { src: "/brock/images/12-move-airplane.jpg", alt: "Brock on airplane" },
            { src: "/brock/images/13-move-roadtrip.jpg", alt: "Brock road trip co-pilot" },
            { src: "/brock/images/14-move-boxes.jpg", alt: "Brock with moving boxes" },
          ],
        },
        {
          type: "text-block",
          content:
            "Airplane carriers, golden hour on the highway, and that first night in a half-empty apartment surrounded by boxes. <strong>Home isn't the city. Home is whoever's on the couch with you.</strong>",
        },
      ],
    },
    {
      number: "Chapter Five",
      title: "Home Again",
      tagline: "South Bend, Indiana. New town, same good boy.",
      sections: [
        {
          type: "photo-full",
          src: "/brock/images/16-home-fall.jpg",
          caption: "First fall in Indiana. The leaves didn't disappoint.",
          location: "South Bend, IN",
        },
        { type: "spacer", size: "md" },
        {
          type: "photo-inset",
          src: "/brock/images/15-home-notredame.jpg",
        },
        {
          type: "text-block",
          content:
            "Notre Dame bandana on, blessed in the spirit of St. Francis. <strong>Technically, the first Catholic in the family.</strong> He moved Kevin and Beryl so much that day, they both joined OCIA. Leave it to a 15-pound goldendoodle to lead his parents to faith.",
        },
        {
          type: "photo-grid",
          images: [
            { src: "/brock/images/17-home-family-kitchen.jpg", alt: "Family portrait in kitchen" },
            { src: "/brock/images/18-home-cozy-toy.jpg", alt: "Brock with toy on couch" },
          ],
        },
        {
          type: "text-block",
          content:
            "Dinner parties in the new kitchen. Movie nights with his favorite Mr. Bunny. Some things never change &mdash; <strong>and that's the whole point.</strong>",
        },
      ],
    },
  ],
  epilogue: {
    title: "Through It All",
    text: "Cities change. Zip codes change. But the little guy on the couch? He just wants to be wherever you are. And honestly, that's enough.",
    images: [
      {
        src: "/brock/images/19-epilogue-embrace.jpg",
        alt: "Beryl embracing Brock",
        caption: "Through every chapter.",
        location: "Always",
      },
      {
        src: "/brock/images/20-epilogue-sleep.jpg",
        alt: "Brock sleeping peacefully",
        caption: "Goodnight, Brock.",
      },
    ],
  },
  footer: "Made with love by Kevin & Beryl",
};
