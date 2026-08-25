# WithBeasley SEO and growth system

## Current implementation

- Canonical public domain: `https://withbeasley.com`
- Crawl controls: public pages are allowed; `/admin` and `/api/` are blocked from crawling and carry an `X-Robots-Tag` noindex response header.
- Sitemap: generated from the defined canonical public pages plus only non-archived, active sale and rental listings.
- Property detail pages: unique canonical URLs, metadata, Open Graph data, facts from the listing record, images, breadcrumbs, `RealEstateListing`, `Offer`, and `BreadcrumbList` structured data.
- Homepage: targets San Miguel de Allende real estate and links to sale, rental, buying, selling, relocation, and neighborhood paths.

## Priority opportunity backlog

The following are themes to assess against Search Console demand and live inventory before creating or expanding pages. Do not create a dedicated property-filter page unless it returns a useful set of active properties.

| Priority | Opportunity | Target / action | Inventory-dependent |
|---|---|---|---|
| High | San Miguel de Allende real estate | Homepage and `/san-miguel-de-allende-real-estate` | No |
| High | Homes for sale | `/homes-for-sale-san-miguel-de-allende` with live sale results | Yes |
| High | Homes for rent | `/homes-for-rent-san-miguel-de-allende` with live rental results | Yes |
| High | Buying property | `/buying-a-home-in-san-miguel-de-allende` | No |
| High | Moving / relocation | `/moving-to-san-miguel-de-allende` and relocation guide | No |
| High | Selling a home | `/selling-san-miguel-de-allende` | No |
| High | Centro real estate | Existing Centro guide, linked from relevant listings | Yes |
| High | Property-detail discovery | Active `/properties/:slug` pages, with unique facts and images | Yes |
| Medium | Luxury homes | Expand only when qualifying active inventory exists | Yes |
| Medium | Guadalupe, La Lejona, Los Senderos | Strengthen pages when listings and verified local editorial information exist | Yes |
| Medium | Malanquín, Ojo de Agua, Zirándaro | Strengthen pages when listings and verified local editorial information exist | Yes |
| Medium | San Antonio and Guadiana | Strengthen existing guides with verified editorial research | Yes |
| Medium | Renting before buying | Add to relocation content with current rental links | No |
| Medium | Buyer viewing checklist | Guide download or buyer guide section | No |
| Medium | Seller preparation | Seller guide section | No |
| Medium | Property photos and video | Add descriptive image alt text and video pages for actual listings | Yes |
| Medium | Buyer consultation CTA | Contextual CTA on guides and property pages | No |
| Medium | Seller valuation CTA | Contextual CTA on seller content | No |
| Low | Bedroom/property-type filters | Publish only after a minimum useful inventory threshold is agreed | Yes |
| Low | Price-band filters | Publish only for current, useful result sets in one currency | Yes |

## Search Console operating loop

Review monthly, after enough data accumulates:

1. Filter queries/pages with high impressions and below-site-average CTR; test more precise titles and descriptions.
2. Prioritize pages averaging positions 5–20 before creating new content.
3. Add contextual internal links from the homepage, guides, and neighborhood pages to those pages.
4. Compare organic landing-page conversion to consultation, guide, phone, email, and WhatsApp actions.
5. Remove, redirect, or noindex only pages that are truly obsolete or lack useful inventory—not simply because they have low traffic.

## Measurement

Track property views, property inquiries, consultation submissions, guide requests, and phone/email/WhatsApp CTA clicks in the site’s approved analytics platform. Store only the information needed to respond to a lead request; do not send form content in analytics events.

## Indexing submission order

1. `/`
2. `/san-miguel-de-allende-real-estate`
3. `/homes-for-sale-san-miguel-de-allende`
4. `/homes-for-rent-san-miguel-de-allende`
5. `/buying-a-home-in-san-miguel-de-allende`
6. `/selling-san-miguel-de-allende`
7. `/moving-to-san-miguel-de-allende`
8. `/neighborhoods`
9. Active canonical property URLs from `/sitemap.xml`
