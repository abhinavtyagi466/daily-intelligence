export const launchWatchlist = {
  programs: [
    { id: "y-combinator", name: "Y Combinator", region: "Global", url: "https://www.ycombinator.com/launches" },
    { id: "techstars", name: "Techstars", region: "Global", url: "https://www.techstars.com/portfolio" },
    { id: "500-global", name: "500 Global", region: "Global", url: "https://500.co/portfolio" },
    { id: "antler", name: "Antler", region: "Global", url: "https://www.antler.co/portfolio" },
    { id: "plug-and-play", name: "Plug and Play", region: "Global", url: "https://welcome.plugandplaytechcenter.com/investment-portfolio" },
    { id: "masschallenge", name: "MassChallenge", region: "Global", url: "https://masschallenge.org/casestudies/startups/" },
    { id: "alchemist", name: "Alchemist Accelerator", region: "Global", url: "https://www.alchemistaccelerator.com/flagship-program" },
    { id: "t-hub", name: "T-Hub", region: "India", url: "https://www.t-hub.co/startups" },
    { id: "iima-ventures", name: "IIMA Ventures", region: "India", url: "https://iimaventures.com/portfolio/" },
    { id: "nsrcel", name: "NSRCEL, IIM Bangalore", region: "India", url: "https://nsrcel.org/portfolio/" },
  ],
  discovery_sources: [
    { name: "Product Hunt", covers: "SaaS, tools and agents", url: "https://www.producthunt.com/" },
    { name: "Show HN", covers: "Founder demos and developer tools", url: "https://news.ycombinator.com/shownew" },
    { name: "Kickstarter Technology", covers: "Hardware and physical products", url: "https://www.kickstarter.com/discover/categories/technology" },
    { name: "Blue Robotics BlueOS releases", covers: "Robotics software and operating systems", url: "https://github.com/bluerobotics/BlueOS/releases" },
  ],
} as const;
