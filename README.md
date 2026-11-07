# Timeless Stories Photography

Build a frontend-only website for a photography business called Events Multimedia GH in Accra, Ghana. Standard React + Vite + React Router (NOT TanStack Start/SSR). No backend, no Supabase, no Cloudinary. Placeholder data only, all inside src/lib/api.ts (getPhotos, getPackages, createBooking, getBookings, uploadPhoto, deletePhoto, savePackage) with types in src/types.ts. Pages call only these functions.

DESIGN DIRECTION
- Luxury editorial photography studio. Photos are the hero, UI stays out of the way.
- Palette: warm off-white (#FAF8F5) background, near-black text, one muted gold/bronze accent. Optional dark mode.
- Typography: elegant serif for headings (Playfair Display or Cormorant Garamond), clean sans for body (Inter). Large headings, generous whitespace, thin dividers.
- Subtle motion only: fade-in on scroll, slow hover zoom on photos, smooth lightbox transitions.
- Fully responsive, mobile-first.

IMAGES
- Use real placeholder photos from Unsplash (source.unsplash.com is retired, so use direct images.unsplash.com photo URLs with ?w=1600&q=80). Pick photos of: weddings, portraits, couples, events, graduations, family, and Ghanaian/African subjects where possible. Keep image URLs in api.ts so they can be swapped later.
- All images lazy-loaded with fixed aspect ratios so the layout doesn't jump.

PAGES
1. Home: full-screen hero image with dark overlay, large serif headline "Timeless stories, captured with elegance.", "View portfolio" and "Book a session" buttons. Below: featured work in a masonry grid, short "About" section with portrait photo, 3 service highlights, testimonials, final call-to-action banner.
2. Gallery: masonry grid, category filter pills (All, Weddings, Portraits, Events, Family), full-screen lightbox with arrow keys, swipe and close button.
3. Rates: 3 elegant package cards (middle one highlighted), price in GHS, inclusions list, "Book this package" button that preselects it on the Book page.
4. Book: two-column layout, form on one side with a photo on the other. Fields: name, phone, email, date, package, message. Submit shows a thank-you message and a direct WhatsApp link with pre-filled booking details.
5. Footer: contact details, WhatsApp button, Instagram link, copyright.
6. /admin/login and /admin (UI only): tabs for Photos (upload, delete, change category), Rates (add/edit/delete), Bookings (table with status). Simple, clean dashboard style with localStorage persistence.

Don't add extra features. Keep code tidy and componentized.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3405ee15-8f97-4fd4-9d54-7dc7ca4e5c43).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
