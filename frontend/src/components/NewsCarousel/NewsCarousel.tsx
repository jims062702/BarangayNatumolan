import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper/types";
import {
  FiCalendar,
  FiClock,
  FiMapPin,
  FiArrowRight,
  FiChevronLeft,
  FiChevronRight,
} from "react-icons/fi";
import Button from "../Button/Button";
import { api } from "../../lib/api";
import { readPublicCache, writePublicCache } from "../../lib/publicContent";
import { news } from "../../data/news";

import "swiper/css";
import "swiper/css/pagination";

interface NewsItem {
  id: number | string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  image: string;
}

interface ApiAnnouncement {
  id: number;
  title: string;
  body: string;
  location?: string | null;
  event_at?: string | null;
  event_time?: string | null;
  image_url?: string | null;
  published_at?: string | null;
}

export default function NewsCarousel() {
  const swiperRef = useRef<SwiperType | null>(null);
  const navigate = useNavigate();
  // null = still deciding what to show (avoids flashing the bundled samples
  // before the SK-posted news arrives). Seeded from sessionStorage so a
  // refresh shows the right posts instantly.
  const [items, setItems] = useState<NewsItem[] | null>(() =>
    readPublicCache<NewsItem[]>("news")
  );

  useEffect(() => {
    api
      .get("/announcements")
      .then((r) => {
        const rows: ApiAnnouncement[] = r.data.data.data ?? [];
        if (rows.length === 0) {
          // Nothing posted yet — show the bundled samples.
          setItems((current) => current ?? news);
          return;
        }
        const mapped = rows.map((a, index) => ({
          id: a.id,
          title: a.title,
          date: a.event_at
            ? new Date(a.event_at).toLocaleDateString("en-PH", { dateStyle: "long" })
            : a.published_at
              ? new Date(a.published_at).toLocaleDateString("en-PH", { dateStyle: "long" })
              : "",
          time: a.event_time ?? "",
          location: a.location ?? "Barangay Natumolan",
          description: a.body,
          image: a.image_url || news[index % news.length].image,
        }));
        setItems(mapped);
        writePublicCache("news", mapped);
      })
      // API unavailable — keep cached posts if any, else the bundled samples.
      .catch(() => setItems((current) => current ?? news));
  }, []);

  if (!items) {
    // Neutral skeleton while the posts load — same shape as a news card.
    return (
      <div
        aria-hidden="true"
        className="grid overflow-hidden rounded-3xl bg-white shadow-xl shadow-primary/5 md:grid-cols-2"
      >
        <div className="h-64 animate-pulse bg-secondary sm:h-72 md:min-h-105" />
        <div className="flex flex-col justify-center gap-4 p-6 sm:p-10">
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-secondary" />
          <div className="h-4 w-1/3 animate-pulse rounded-full bg-secondary" />
          <div className="h-24 animate-pulse rounded-2xl bg-secondary" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <Swiper
        modules={[Autoplay, Pagination]}
        onSwiper={(swiper) => {
          swiperRef.current = swiper;
        }}
        loop
        speed={700}
        autoplay={{ delay: 6500, disableOnInteraction: false }}
        pagination={{ clickable: true }}
        spaceBetween={32}
        className="news-swiper"
      >
        {items.map((item) => (
          <SwiperSlide key={item.id}>
            <article className="grid overflow-hidden rounded-3xl bg-white shadow-xl shadow-primary/5 md:grid-cols-2">
              {/* Image with title overlay */}
              <div className="relative h-64 sm:h-72 md:h-auto md:min-h-105">
                <img
                  src={item.image}
                  alt={item.title}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-dark/85 via-dark/10 to-transparent"
                />
                <h3 className="absolute bottom-5 left-5 right-5 text-xl font-bold leading-snug text-white sm:text-2xl">
                  {item.title}
                </h3>
              </div>

              {/* Details */}
              <div className="flex flex-col justify-center gap-4 p-6 sm:p-10">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
                  <span className="inline-flex items-center gap-2">
                    <FiCalendar className="shrink-0 text-primary" aria-hidden="true" />
                    {item.date}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <FiClock className="shrink-0 text-primary" aria-hidden="true" />
                    {item.time}
                  </span>
                </div>
                <span className="inline-flex items-center gap-2 text-sm text-gray-500">
                  <FiMapPin className="shrink-0 text-primary" aria-hidden="true" />
                  {item.location}
                </span>
                <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
                  {item.description}
                </p>
                <div className="mt-2">
                  {/* Opens the full announcement on its own page (with
                      breadcrumbs + related news). The item travels along so
                      bundled sample posts open too. */}
                  <Button onClick={() => navigate(`/news/${item.id}`, { state: { item } })}>
                    Read More <FiArrowRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </article>
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Carousel controls */}
      <button
        type="button"
        aria-label="Previous news"
        onClick={() => swiperRef.current?.slidePrev()}
        className="absolute -left-5 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-primary shadow-lg transition-colors duration-300 hover:bg-primary hover:text-white lg:flex"
      >
        <FiChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Next news"
        onClick={() => swiperRef.current?.slideNext()}
        className="absolute -right-5 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-primary shadow-lg transition-colors duration-300 hover:bg-primary hover:text-white lg:flex"
      >
        <FiChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
