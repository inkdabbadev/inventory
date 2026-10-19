# INK DABBA Inventory

Mobile inventory and equipment-checkout app for Android and iOS, built with React Native, Expo, SQLite and Supabase.

It covers both jobs: the **store room** (what you have, where it is, how much is left) and **checkout** (who took what for which project, and when it came back).

## Inventory types

| Type | Example | Labelling | Actions |
|---|---|---|---|
| Reusable asset | 20 HDMI cables | One QR per unit: `CBL-0001` … `CBL-0020` | Issue, return, transfer, maintenance |
| Consumable | 100 m wire roll | One QR on the roll | Use 15 m → 85 m left, add stock, count |
| Quantity box | 200 connectors | One QR on the box | Take 25 → 175 left, add stock, count |
| Location | Rack, shelf, hook, bin | One QR per place | Scan to see contents, audit |

## Features

- A single scanner reads QR, Code 128/39, EAN, UPC and DataMatrix. The same code is ignored for 2 s after a scan, and there is a torch toggle.
- Each record has a permanent UUID. QR codes, manufacturer barcodes and, later, RFID/NFC values are rows in `identifiers` that point to that record. You can link extra codes from any item screen.
- Multi-scan cart: scan 10 cables, review them, then issue or return all of them in one all-or-nothing transaction. A project screen also has **Return all**.
- Issue records the project, the staff member, the time and the expected return date. Overdue items are flagged on the dashboard.
- Validation rules: an item that is already checked out can't be issued again, and stock can't go below zero. The app checks this on the device, and the server checks it again.
- Audit: scan a shelf's QR, then scan what is physically on it. The app lists what is missing and what doesn't belong there (it can move those items to the shelf), and you enter stock counts, which are saved as adjustments.
- QR label sheets print through the system print dialog or export as a PDF. Reprinting reuses the same code.
- **Bulk CSV import** (Home → Import, or the upload icon on Inventory): loads a large catalog in one transaction. It recognises common headers (Item Name, Qty, UOM, SKU, Vendor…), creates missing locations by name, adds units to an existing product with the same name instead of duplicating it, reports bad rows without stopping the import, then prints every new label. **Get template** shares a sample CSV.
- All database tables, functions and the role type start with `inventory_`, both on the phone (SQLite) and in Supabase.
- Offline-first: everything is written to SQLite first. When Supabase is configured, **Settings → Sync now** uploads queued changes and downloads other devices' changes. If the server rejects a movement, it is kept as a *conflict* for review and is never silently overwritten.
- Supabase schema covers multiple companies, Admin/Manager/Staff roles with Row Level Security, and an append-only movement ledger.

## Categories & item codes

Items are organised as **Group › Type** and get codes in the form `GROUP-TYPE-NNNN`, for example `CBL-HDM-0007` (Cables › HDMI, unit 7) or `TOL-PWT-0002` (Tools › Power tool). The full list is in [src/domain/taxonomy.ts](src/domain/taxonomy.ts):

| Code | Group | Example types |
|---|---|---|
| CBL | Cables | HDMI, DisplayPort, SDI, Cat6, USB, Audio, Speakon, DMX, Power cord, Extension, Drum, Fiber, Loose wire (m) |
| SIG | Signal & video | HDMI extender, Splitter, Switcher/matrix, Converter, Capture card, Wireless video |
| PRJ | Projection & display | Projector, Lens, Mount, Screen, LED panel, Monitor, Media server, Laptop |
| CMP | Computer & peripherals | Keyboard, Mouse, KVM, USB hub, Storage, Controller (MIDI/Stream Deck) |
| NET | Networking | Switch, Router, Access point, Patch panel |
| LGT | Lighting & DMX | Fixture, DMX interface, Art-Net node, Dimmer, LED strip/pixel (m), Haze/FX |
| AUD | Audio | Mixer, Mic, Speaker, Amp, DI box, IEM |
| IOT | IoT & electronics | Microcontroller (ESP32/Pi), Sensor, Relay, SMPS, Module, Components box, Motor |
| PWR | Power distribution | Distro, Switch box, UPS, Battery pack, Charger, Generator |
| TOL | Tools | Power tool (drill, angle grinder), Hand tool (screwdriver set), Cutting, Blades & bits, Measuring, Soldering, Ladder |
| CON | Consumables | Tape, Cable ties, Fasteners, Solder, Glue, Cells, Labels |
| RIG | Rigging & stands | Truss, Clamp, Stand, Safety cable, Bracket |
| CAS | Cases & storage | Flight case, Box/bin, Bag |

- Picking a type fills in sensible defaults: a name, whether to count each piece or by quantity, the unit, and quick picks for the sub-name (lengths, models).
- Choose **Custom** to type any category that isn't in the list. Its code comes from the letters of the name.
- Assets and stock share one number sequence per code, so a code is never used twice.
- **Categories** (Home or Settings) lets you browse every group and type with live counts, and prints a one-page code guide to put on the store-room wall.

## Design system

The UI uses a **CMYK glass** theme ([src/theme.ts](src/theme.ts), [src/components/ui.tsx](src/components/ui.tsx)):

- **Colours:** a black ("key") canvas with soft cyan, magenta and yellow glows. Cyan marks primary actions, magenta is the accent and warning colour, and yellow flags things that need attention.
- **Glass surfaces:** frosted blur on iOS (`expo-blur`) and a translucent fill on Android, both with a thin highlight border and a light top sheen.
- **Navigation:** a floating glass tab bar with a raised cyan→magenta scan button, iOS-style large titles, and blurred transparent navigation bars.
- **Feedback:** taps scale with a spring and trigger haptics. Confirmations appear as non-blocking glass toasts, and pop-up alerts are kept for real decisions.
- **Scanner:** a corner frame in the four CMYK colours, an animated scan line, and a flash when a code is read.
- **Performance:** long lists are virtualised (`FlatList`), search waits until you pause typing, and SQLite has indexes on the columns used for filtering and joins.

## Run it

```bash
cd inkdabba-inventory
npm install
npx expo start          # scan the QR with Expo Go, or press a / i
```

Without a `.env` file the app runs fully offline on the device.

### Enable cloud sync (optional)

1. Create a Supabase project and run [supabase/schema.sql](supabase/schema.sql) in the SQL editor.
2. Create a user in Supabase Auth, then run the bootstrap lines at the bottom of the schema to create the company and an admin profile.
3. Copy `.env.example` to `.env` and fill in the URL and anon key.
4. Restart `npx expo start`, open **Settings**, sign in, then tap **Sync now**.

## First milestone walkthrough

1. **Settings**: enter your name.
2. **Locations**: add "Cable Wall / Hook 3" and print its label.
3. **Add item**: choose Reusable asset, name it "HDMI Cable 10m", use prefix `CBL` and 1 unit. Save, then print the label.
4. **Projects**: add a project.
5. **Scan**: scan the cable's QR, tap **Issue**, choose the project and a return date.
6. Scan it again and tap **Return**. The full movement history appears on the item screen.

## Structure

```
app/                     Expo Router screens
  index.tsx              dashboard
  scan.tsx               look up / link a code
  cart.tsx               multi-scan issue & return
  action.tsx             one form for every movement (single item or cart)
  add.tsx                create assets / stock with QR
  asset/[id] lot/[id]    item detail, labels, identifiers, history
  locations/ projects/   management screens
  audit.tsx              shelf audit
  settings.tsx           staff name, sign-in, sync, conflicts
src/
  domain/types.ts        data model
  db/client.ts           SQLite schema + migrations
  services/inventory.ts  business rules (all stock changes go through applyAction)
  services/sync.ts       push catalog → push movements via RPC → pull changes
  lib/labels.ts          QR label sheets (expo-print)
  components/Scanner.tsx camera scanner (swap point for Bluetooth/RFID readers)
supabase/schema.sql      Postgres tables, RLS, apply_movement()
```

## Roadmap

- **Bluetooth barcode scanners**: these act as keyboards (HID), so feed their input into the same `onScan` handler the camera uses.
- **RFID / NFC**: store EPCs and UIDs as `identifiers` with type `rfid` or `nfc`. No data migration is needed.
- **Web admin**: a Next.js app using the same Supabase backend and RLS.
- **Photos**: Supabase Storage bucket keyed by product id.
#   i n v e n t o r y  
 #   i n v e n t o r y  
 