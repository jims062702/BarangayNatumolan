import { useEffect, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectFade, Pagination } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper/types";
import { motion, type MotionProps } from "framer-motion";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import Button from "../Button/Button";
import { api } from "../../lib/api";
import { readPublicCache, writePublicCache } from "../../lib/publicContent";
import hero1 from "../../assets/images/hero-1.svg";
import hero2 from "../../assets/images/hero-2.svg";
import hero3 from "../../assets/images/hero-3.svg";

import "swiper/css";
import "swiper/css/effect-fade";
import "swiper/css/pagination";

interface HeroSlide {
  id: number;
  image: string;
  alt: string;
}

// Defaults shown until the SK office uploads home pictures.
const defaultSlides: HeroSlide[] = [
  { id: 1, image: hero1, alt: "Barangay hall of Natumolan at dusk" },
  { id: 2, image: hero2, alt: "River and hills surrounding Natumolan" },
  { id: 3, image: hero3, alt: "Community fiesta celebration at sunrise" },
];

const fadeUp = (delay: number): MotionProps => ({
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: "easeOut" },
});

export default function HeroCarousel() {
  const swiperRef = useRef<SwiperType | null>(null);
  // null = still deciding which images to show (avoids flashing the defaults
  // before the SK-managed pictures arrive). Seeded from sessionStorage so a
  // refresh shows the right pictures instantly.
  const [slides, setSlides] = useState<HeroSlide[] | null>(() =>
    readPublicCache<HeroSlide[]>("hero-slides")
  );

  useEffect(() => {
    api
      .get("/hero-slides")
      .then((r) => {
        const managed = (r.data.data ?? [])
          .filter((s: { image_url?: string }) => s.image_url)
          .map((s: { id: number; image_url: string; title?: string }) => ({
            id: s.id,
            image: s.image_url,
            alt: s.title ?? "Barangay Natumolan",
          }));
        // Show SK pictures if any, otherwise the bundled defaults. Only the
        // SK pictures are cached — bundled asset URLs change between builds.
        setSlides(managed.length > 0 ? managed : defaultSlides);
        if (managed.length > 0) writePublicCache("hero-slides", managed);
      })
      // Fall back if the API is down (keep cached pictures when we have them).
      .catch(() => setSlides((current) => current ?? defaultSlides));
  }, []);

  return (
    // bg-dark backs the slightly transparent images so they read as gently
    // dimmed (not washed out).
    <div className="relative h-screen w-full bg-dark">
      {slides ? (
        <Swiper
          modules={[Autoplay, EffectFade, Pagination]}
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
          }}
          effect="fade"
          fadeEffect={{ crossFade: true }}
          speed={1200}
          loop
          autoplay={{ delay: 5000, disableOnInteraction: false }}
          pagination={{ clickable: true }}
          className="hero-swiper h-full"
        >
          {slides.map((slide) => (
            <SwiperSlide key={slide.id}>
              <img
                src={slide.image}
                alt={slide.alt}
                className="h-full w-full object-cover opacity-90"
              />
            </SwiperSlide>
          ))}
        </Swiper>
      ) : (
        // Neutral branded backdrop while the pictures load.
        <div
          aria-hidden="true"
          className="h-full w-full bg-gradient-to-br from-primary-dark via-primary to-primary-light"
        />
      )}

      {/* Dark overlay for text contrast */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-dark/70 via-dark/35 to-dark/75"
      />

      {/* Overlay content */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-4 text-center">
        <motion.span
          {...fadeUp(0.2)}
          className="rounded-full border border-white/25 bg-white/10 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-white backdrop-blur-sm sm:text-xs"
        >
          Tagoloan · Misamis Oriental
        </motion.span>

        <motion.h1
          {...fadeUp(0.4)}
          className="mt-6 max-w-4xl text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl"
        >
          Welcome to <span className="text-primary-light">Barangay Natumolan</span>
        </motion.h1>

        <motion.p
          {...fadeUp(0.6)}
          className="mt-5 max-w-2xl text-base font-light text-white/90 sm:text-lg"
        >
          Serving the community with transparency, unity, and excellence.
        </motion.p>

        <motion.div
          {...fadeUp(0.8)}
          className="pointer-events-auto mt-9 flex flex-col gap-4 sm:flex-row"
        >
          <Button href="#about">Learn More</Button>
          <Button href="#contact" variant="outline">
            Contact Us
          </Button>
        </motion.div>
      </div>

      {/* Carousel controls */}
      <button
        type="button"
        aria-label="Previous slide"
        onClick={() => swiperRef.current?.slidePrev()}
        className="absolute left-4 top-1/2 z-30 hidden h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-sm transition-colors duration-300 hover:bg-white hover:text-primary sm:flex lg:left-8"
      >
        <FiChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        aria-label="Next slide"
        onClick={() => swiperRef.current?.slideNext()}
        className="absolute right-4 top-1/2 z-30 hidden h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-sm transition-colors duration-300 hover:bg-white hover:text-primary sm:flex lg:right-8"
      >
        <FiChevronRight className="h-6 w-6" />
      </button>
    </div>
  );
}
