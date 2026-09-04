import news1 from "../assets/images/news-1.svg";
import news2 from "../assets/images/news-2.svg";
import news3 from "../assets/images/news-3.svg";
import news4 from "../assets/images/news-4.svg";

export interface NewsItem {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  image: string;
}

export const news: NewsItem[] = [
  {
    id: 1,
    title: "3rd Quarter Barangay Assembly 2026",
    date: "August 15, 2026",
    time: "9:00 AM – 12:00 NN",
    location: "Barangay Natumolan Covered Court",
    description:
      "All residents are invited to the quarterly Barangay Assembly. The council will present accomplishment reports, the utilization of the barangay budget, and upcoming projects. Your voice matters — join the open forum and help shape the future of our community.",
    image: news1,
  },
  {
    id: 2,
    title: "Free Medical & Dental Mission",
    date: "August 29, 2026",
    time: "7:00 AM – 4:00 PM",
    location: "Barangay Health Station",
    description:
      "In partnership with the Municipal Health Office, Barangay Natumolan brings free check-ups, dental extraction, blood pressure monitoring, and free medicines to all residents. Bring your barangay ID and arrive early — first come, first served.",
    image: news2,
  },
  {
    id: 3,
    title: "Coastal & River Clean-Up Drive",
    date: "September 12, 2026",
    time: "6:00 AM – 10:00 AM",
    location: "Natumolan Riverside, Zone 3",
    description:
      "Join our volunteers, barangay officials, and youth organizations in keeping our waterways clean. Gloves, sacks, and refreshments will be provided. Together, let us protect the environment for the next generation of Natumolanons.",
    image: news3,
  },
  {
    id: 4,
    title: "SK Youth Leadership Summit",
    date: "September 26, 2026",
    time: "8:00 AM – 5:00 PM",
    location: "Barangay Natumolan Multi-Purpose Hall",
    description:
      "The Sangguniang Kabataan invites all youth aged 15–30 to a whole-day summit on leadership, civic engagement, and community projects. Free registration, meals, and certificates await participants. Slots are limited — register at the SK Office.",
    image: news4,
  },
];
