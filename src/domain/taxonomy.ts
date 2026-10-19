import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

/**
 * INK DABBA category system - built for event production / projection mapping.
 *
 * Every item code is   GROUP-SUB-NNNN   e.g.
 *   CBL-HDM-0007  Cables › HDMI, unit 7
 *   TOL-PWT-0002  Tools › Power tools (angle grinder), unit 2
 *   IOT-MCU-0001  IoT › Microcontrollers (ESP32 box)
 *
 * Reading a label tells you what it is and where it belongs, even without the app.
 * Edit this file to add groups or subcategories; codes must stay unique and ≤ 3 letters.
 * Anything not listed can still be typed as a custom category in the app.
 */

type Icon = ComponentProps<typeof Ionicons>['name'];
export type Track = 'each' | 'quantity';

export interface Subcategory {
  code: string; // 3 letters, unique within the group
  name: string;
  /** default way to count: each piece gets a QR, or one QR on a box/roll */
  track: Track;
  unit?: string; // default unit when tracked by quantity
  /** quick picks for the sub-name field (lengths, types, models) */
  variants?: string[];
}

export interface CategoryGroup {
  code: string; // 3 letters, unique
  name: string;
  icon: Icon;
  color: string;
  subs: Subcategory[];
}

const LENGTHS = ['1 m', '1.5 m', '3 m', '5 m', '10 m', '15 m', '20 m', '30 m', '50 m'];

export const TAXONOMY: CategoryGroup[] = [
  {
    code: 'CBL', name: 'Cables', icon: 'git-branch', color: '#00AEEF',
    subs: [
      { code: 'HDM', name: 'HDMI', track: 'each', variants: [...LENGTHS, 'Fiber HDMI 30 m', 'Micro HDMI', 'Mini HDMI'] },
      { code: 'DPT', name: 'DisplayPort', track: 'each', variants: ['DP–DP 2 m', 'Mini DP–HDMI', 'DP–HDMI', ...LENGTHS] },
      { code: 'SDI', name: 'SDI / BNC', track: 'each', variants: ['3G-SDI 5 m', '12G-SDI 10 m', ...LENGTHS] },
      { code: 'CAT', name: 'Cat6 / Ethernet', track: 'each', variants: ['Cat6 1 m', 'Cat6 5 m', 'Cat6 10 m', 'Cat6 30 m', 'Cat6 50 m', 'Cat6 drum 100 m', 'EtherCON'] },
      { code: 'USB', name: 'USB', track: 'each', variants: ['USB-C to C', 'USB-A to C', 'USB-A to B', 'Active extension 10 m', 'Micro USB'] },
      { code: 'AUD', name: 'Audio', track: 'each', variants: ['XLR M–F', 'TRS 6.35 mm', '3.5 mm AUX', 'RCA', '3.5 mm to 2× RCA', 'Multicore snake'] },
      { code: 'SPK', name: 'Speaker (Speakon)', track: 'each', variants: ['NL4 10 m', 'NL4 20 m', 'NL2'] },
      { code: 'DMX', name: 'DMX', track: 'each', variants: ['3-pin 1 m', '3-pin 5 m', '3-pin 10 m', '5-pin 5 m', '5-pin 10 m', '3-to-5 pin adapter'] },
      { code: 'PWR', name: 'Power cord', track: 'each', variants: ['3-pin India', 'IEC C13', 'IEC C19', 'PowerCON', 'PowerCON True1', 'Figure-8'] },
      { code: 'EXT', name: 'Extension / spike board', track: 'each', variants: ['4-way 5 m', '6-way 10 m', 'Heavy duty 16 A', 'Universal spike'] },
      { code: 'DRM', name: 'Cable drum / coil', track: 'each', variants: ['25 m drum', '50 m drum', '100 m drum'] },
      { code: 'VGA', name: 'VGA / DVI', track: 'each', variants: ['VGA 5 m', 'DVI-D', 'DVI–HDMI'] },
      { code: 'FBR', name: 'Fiber optic', track: 'each', variants: ['LC–LC', 'SC–SC', 'opticalCON', 'Armored 100 m'] },
      { code: 'WIR', name: 'Loose wire (by metre)', track: 'quantity', unit: 'm', variants: ['1.5 sq mm red', '1.5 sq mm black', '2.5 sq mm', '0.75 sq mm flexible', 'Speaker wire', 'Jumper wire'] },
    ],
  },
  {
    code: 'SIG', name: 'Signal & video', icon: 'swap-horizontal', color: '#2F6FEB',
    subs: [
      { code: 'EXT', name: 'HDMI extender', track: 'each', variants: ['HDBaseT 70 m', 'Cat6 60 m', 'Fiber', 'Wireless 50 m'] },
      { code: 'SPL', name: 'Splitter', track: 'each', variants: ['1×2', '1×4', '1×8', '4K 1×4'] },
      { code: 'SWT', name: 'Switcher / matrix', track: 'each', variants: ['4×1', '4×4 matrix', '8×8 matrix', 'Seamless switcher'] },
      { code: 'CNV', name: 'Converter', track: 'each', variants: ['HDMI→SDI', 'SDI→HDMI', 'HDMI→VGA', 'USB-C→HDMI', 'Audio de-embedder'] },
      { code: 'CAP', name: 'Capture card', track: 'each', variants: ['USB 4K', 'PCIe', 'Elgato', 'Blackmagic'] },
      { code: 'SCL', name: 'Scaler / processor', track: 'each', variants: ['LED processor', 'Video wall controller', 'Edge-blend processor'] },
      { code: 'WRL', name: 'Wireless video', track: 'each', variants: ['TX/RX pair', 'Hollyland', 'Accsoon'] },
    ],
  },
  {
    code: 'PRJ', name: 'Projection & display', icon: 'videocam', color: '#EC008C',
    subs: [
      { code: 'PRJ', name: 'Projector', track: 'each', variants: ['10K lumens', '20K lumens', 'Laser', 'Short throw', 'Panasonic', 'Epson', 'Christie'] },
      { code: 'LNS', name: 'Lens', track: 'each', variants: ['Standard zoom', 'Short throw', 'Long throw', 'Ultra short throw'] },
      { code: 'MNT', name: 'Projector mount / frame', track: 'each', variants: ['Ceiling mount', 'Stacking frame', 'Rigging frame'] },
      { code: 'SCR', name: 'Screen / surface', track: 'each', variants: ['Fast-fold 12×9', 'Tripod screen', 'Rear projection', 'Gauze'] },
      { code: 'LED', name: 'LED panel', track: 'each', variants: ['P2.6', 'P3.9', 'P4.8 outdoor', 'Flight case of 6'] },
      { code: 'MON', name: 'Monitor / TV', track: 'each', variants: ['24"', '32"', '55"', '65"', 'Preview monitor 7"'] },
      { code: 'MED', name: 'Media server', track: 'each', variants: ['Resolume PC', 'TouchDesigner PC', 'Disguise', 'Watchout'] },
      { code: 'LAP', name: 'Laptop', track: 'each', variants: ['MacBook Pro', 'Windows show laptop', 'Backup laptop'] },
    ],
  },
  {
    code: 'CMP', name: 'Computer & peripherals', icon: 'desktop', color: '#5BC0EB',
    subs: [
      { code: 'KBD', name: 'Keyboard', track: 'each', variants: ['Wired', 'Wireless', 'Mini', 'Mechanical'] },
      { code: 'MOU', name: 'Mouse', track: 'each', variants: ['Wired', 'Wireless', 'Trackball'] },
      { code: 'KVM', name: 'KVM switch', track: 'each', variants: ['2-port', '4-port', 'KVM extender'] },
      { code: 'HUB', name: 'USB hub / dock', track: 'each', variants: ['4-port USB 3', 'USB-C dock', 'Powered 7-port'] },
      { code: 'STO', name: 'Storage', track: 'each', variants: ['SSD 1 TB', 'SSD 2 TB', 'Pendrive 64 GB', 'HDD 4 TB'] },
      { code: 'CTL', name: 'Controller', track: 'each', variants: ['MIDI controller', 'Stream Deck', 'APC40', 'Launchpad'] },
      { code: 'TAB', name: 'Tablet / phone', track: 'each', variants: ['iPad', 'Android tablet', 'Show-control phone'] },
      { code: 'GPU', name: 'PC parts', track: 'each', variants: ['Graphics card', 'RAM', 'Power supply', 'Cooling fan'] },
    ],
  },
  {
    code: 'NET', name: 'Networking', icon: 'wifi', color: '#2EE6A6',
    subs: [
      { code: 'SWI', name: 'Network switch', track: 'each', variants: ['8-port', '16-port', '24-port PoE', 'Managed'] },
      { code: 'RTR', name: 'Router', track: 'each', variants: ['Wi-Fi 6', '4G/5G router', 'Travel router'] },
      { code: 'APT', name: 'Access point', track: 'each', variants: ['Indoor', 'Outdoor', 'Ubiquiti'] },
      { code: 'PAT', name: 'Patch panel / coupler', track: 'each', variants: ['12-port', 'RJ45 coupler', 'EtherCON panel'] },
    ],
  },
  {
    code: 'LGT', name: 'Lighting & DMX', icon: 'bulb', color: '#FFE600',
    subs: [
      { code: 'FIX', name: 'Fixture', track: 'each', variants: ['LED par', 'Moving head beam', 'Moving head wash', 'Blinder', 'Strobe', 'Profile spot', 'Bar light'] },
      { code: 'DMX', name: 'DMX controller / interface', track: 'each', variants: ['USB-DMX', 'Lighting console', 'DMX splitter', 'Wireless DMX TX/RX'] },
      { code: 'NOD', name: 'Art-Net / sACN node', track: 'each', variants: ['1 universe', '2 universe', '4 universe', '8 universe'] },
      { code: 'DIM', name: 'Dimmer / relay pack', track: 'each', variants: ['4-channel', '6-channel', '12-channel'] },
      { code: 'STP', name: 'LED strip / pixel', track: 'quantity', unit: 'm', variants: ['WS2812B 60/m', 'WS2815 12 V', 'SK6812 RGBW', 'COB strip', 'Neon flex'] },
      { code: 'ATM', name: 'Haze / fog / FX', track: 'each', variants: ['Hazer', 'Fog machine', 'Low fog', 'Bubble machine', 'Sparkular'] },
    ],
  },
  {
    code: 'AUD', name: 'Audio', icon: 'musical-notes', color: '#B388FF',
    subs: [
      { code: 'MIX', name: 'Mixer / interface', track: 'each', variants: ['8-channel', '16-channel digital', 'USB audio interface'] },
      { code: 'MIC', name: 'Microphone', track: 'each', variants: ['Wireless handheld', 'Lapel', 'Headset', 'Wired SM58', 'Condenser'] },
      { code: 'SPK', name: 'Speaker', track: 'each', variants: ['Active 12"', 'Active 15"', 'Subwoofer 18"', 'Monitor wedge', 'Bluetooth'] },
      { code: 'AMP', name: 'Amplifier', track: 'each', variants: ['2-channel', '4-channel'] },
      { code: 'DIB', name: 'DI box', track: 'each', variants: ['Passive', 'Active', 'Stereo'] },
      { code: 'IEM', name: 'In-ear / headphone', track: 'each', variants: ['IEM system', 'Studio headphones', 'Intercom headset'] },
    ],
  },
  {
    code: 'IOT', name: 'IoT & electronics', icon: 'hardware-chip', color: '#00E5C7',
    subs: [
      { code: 'MCU', name: 'Microcontroller / SBC', track: 'each', variants: ['Arduino Uno', 'Arduino Mega', 'ESP32', 'ESP8266', 'Raspberry Pi 4', 'Raspberry Pi 5', 'Teensy'] },
      { code: 'SEN', name: 'Sensor', track: 'quantity', unit: 'pcs', variants: ['PIR motion', 'Ultrasonic', 'LiDAR', 'Kinect / depth camera', 'Touch / capacitive', 'IR break-beam', 'IMU'] },
      { code: 'RLY', name: 'Relay / driver', track: 'quantity', unit: 'pcs', variants: ['1-ch relay', '4-ch relay', '8-ch relay', 'MOSFET driver', 'Motor driver', 'SSR'] },
      { code: 'PSU', name: 'Power supply / SMPS', track: 'each', variants: ['5 V 10 A', '5 V 60 A', '12 V 10 A', '12 V 30 A', '24 V', 'Buck converter'] },
      { code: 'MOD', name: 'Module', track: 'quantity', unit: 'pcs', variants: ['Level shifter', 'RTC', 'Wi-Fi module', 'Display OLED', 'Amplifier module', 'MP3 player'] },
      { code: 'CMP', name: 'Components (box)', track: 'quantity', unit: 'pcs', variants: ['Resistor kit', 'Capacitor kit', 'LEDs 5 mm', 'Headers', 'JST connectors', 'Screw terminals', 'Diodes'] },
      { code: 'BRD', name: 'Breadboard / PCB', track: 'quantity', unit: 'pcs', variants: ['Full breadboard', 'Half breadboard', 'Perfboard', 'Custom PCB'] },
      { code: 'MTR', name: 'Motor / actuator', track: 'quantity', unit: 'pcs', variants: ['Servo SG90', 'Servo MG996R', 'Stepper NEMA17', 'DC geared motor', 'Solenoid', 'Linear actuator'] },
    ],
  },
  {
    code: 'PWR', name: 'Power distribution', icon: 'flash', color: '#FF8A3D',
    subs: [
      { code: 'DST', name: 'Distro / power box', track: 'each', variants: ['32 A 3-phase distro', '16 A distro', 'Rack PDU'] },
      { code: 'SWB', name: 'Switch box', track: 'each', variants: ['4-switch', '8-switch', 'With MCB', 'With indicator'] },
      { code: 'UPS', name: 'UPS / stabiliser', track: 'each', variants: ['1 kVA', '2 kVA', '5 kVA', 'Online UPS'] },
      { code: 'BAT', name: 'Battery pack / power bank', track: 'each', variants: ['V-mount', 'Power bank 20000 mAh', 'Li-ion 18650 pack', 'Lead-acid 12 V'] },
      { code: 'CHG', name: 'Charger / adapter', track: 'each', variants: ['Laptop charger', 'USB-C PD 65 W', '12 V adapter', 'Battery charger'] },
      { code: 'GEN', name: 'Generator', track: 'each', variants: ['5 kVA', '10 kVA', 'Silent'] },
    ],
  },
  {
    code: 'TOL', name: 'Tools', icon: 'construct', color: '#FF3D9A',
    subs: [
      { code: 'PWT', name: 'Power tool', track: 'each', variants: ['Drill machine', 'Impact driver', 'Angle grinder', 'Jigsaw', 'Circular saw', 'Heat gun', 'Hot glue gun', 'Rotary tool (Dremel)'] },
      { code: 'HND', name: 'Hand tool', track: 'each', variants: ['Screwdriver set', 'Plier set', 'Wire stripper', 'Crimper', 'Spanner set', 'Allen key set', 'Hammer', 'Hacksaw'] },
      { code: 'CUT', name: 'Cutting tool', track: 'each', variants: ['Cutter knife', 'Scissors', 'Wire cutter', 'Bolt cutter', 'Hand saw'] },
      { code: 'BLD', name: 'Blades & bits', track: 'quantity', unit: 'pcs', variants: ['Cutter blades', 'Grinder cutting disc', 'Grinder grinding disc', 'Jigsaw blades', 'Drill bit set', 'Screwdriver bits', 'Hole saw'] },
      { code: 'MSR', name: 'Measuring / testing', track: 'each', variants: ['Measuring tape', 'Laser distance meter', 'Laser level', 'Multimeter', 'Network tester', 'DMX tester', 'Lux meter'] },
      { code: 'SOL', name: 'Soldering', track: 'each', variants: ['Soldering iron', 'Soldering station', 'Hot air station', 'Desoldering pump'] },
      { code: 'LAD', name: 'Ladder / access', track: 'each', variants: ['6 ft ladder', '10 ft ladder', 'A-frame', 'Scaffold'] },
    ],
  },
  {
    code: 'CON', name: 'Consumables', icon: 'cube', color: '#A0A0B8',
    subs: [
      { code: 'TAP', name: 'Tape', track: 'quantity', unit: 'roll', variants: ['Gaffer black', 'Gaffer white', 'Electrical tape', 'Double-sided', 'Masking', 'Glow tape', 'Floor marking'] },
      { code: 'TIE', name: 'Cable ties / velcro', track: 'quantity', unit: 'pcs', variants: ['Zip tie 150 mm', 'Zip tie 300 mm', 'Velcro roll', 'Velcro straps', 'Cable clips'] },
      { code: 'FAS', name: 'Screws & fasteners', track: 'quantity', unit: 'pcs', variants: ['Wood screws', 'Machine screws M4', 'Nuts & bolts M8', 'Wall plugs', 'Washers', 'Rivets'] },
      { code: 'SLD', name: 'Solder & flux', track: 'quantity', unit: 'pcs', variants: ['Solder wire 0.8 mm', 'Flux paste', 'Heat shrink kit', 'Solder wick'] },
      { code: 'GLU', name: 'Glue & adhesive', track: 'quantity', unit: 'pcs', variants: ['Glue sticks', 'Super glue', 'Epoxy', 'Silicone'] },
      { code: 'CEL', name: 'Batteries (cells)', track: 'quantity', unit: 'pcs', variants: ['AA', 'AAA', '9 V', 'CR2032', '18650'] },
      { code: 'LBL', name: 'Labels & markers', track: 'quantity', unit: 'pcs', variants: ['QR label roll', 'Permanent marker', 'Cable labels'] },
    ],
  },
  {
    code: 'RIG', name: 'Rigging & stands', icon: 'git-network', color: '#7C8CFF',
    subs: [
      { code: 'TRS', name: 'Truss', track: 'each', variants: ['1 m box truss', '2 m box truss', '3 m box truss', 'Corner block', 'Base plate'] },
      { code: 'CLM', name: 'Clamp / coupler', track: 'quantity', unit: 'pcs', variants: ['Half coupler', 'G-clamp', 'Super clamp', 'Magic arm'] },
      { code: 'STD', name: 'Stand / tripod', track: 'each', variants: ['Light stand', 'Speaker stand', 'Projector stand', 'Laptop stand', 'T-bar stand'] },
      { code: 'SAF', name: 'Safety cable / shackle', track: 'quantity', unit: 'pcs', variants: ['Safety cable 60 cm', 'Shackle', 'Ratchet strap', 'Round sling'] },
      { code: 'MNT', name: 'Bracket / mount', track: 'each', variants: ['TV wall mount', 'TV floor stand', 'Camera mount', 'Pipe mount'] },
    ],
  },
  {
    code: 'CAS', name: 'Cases & storage', icon: 'briefcase', color: '#C9B400',
    subs: [
      { code: 'FLT', name: 'Flight case', track: 'each', variants: ['Projector case', 'Rack case 4U', 'Cable trunk', 'Laptop case'] },
      { code: 'BOX', name: 'Box / bin', track: 'each', variants: ['Box of mixed wires', 'Box of adapters', 'Tool box', 'Crate', 'Stackable bin'] },
      { code: 'BAG', name: 'Bag / pouch', track: 'each', variants: ['Cable bag', 'Tool bag', 'Tripod bag'] },
    ],
  },
];

export interface TaxonomyMatch {
  group: CategoryGroup;
  sub?: Subcategory;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Finds a group / subcategory by name or code (case-insensitive). Used by the form and CSV import. */
export function findTaxonomy(category?: string | null, subcategory?: string | null): TaxonomyMatch | null {
  if (!category) return null;
  const c = norm(category);
  const group = TAXONOMY.find((g) => norm(g.name) === c || norm(g.code) === c);
  if (!group) return null;
  if (!subcategory) return { group };
  const s = norm(subcategory);
  const sub = group.subs.find((x) => norm(x.name) === s || norm(x.code) === s);
  return { group, sub };
}

/** "CBL-HDM" for Cables › HDMI; falls back to letters of custom names ("STA-PRO" for Stage › Props). */
export function codePrefixFor(category?: string | null, subcategory?: string | null): string {
  const m = findTaxonomy(category, subcategory);
  const letters = (s?: string | null) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  const g = m?.group.code ?? letters(category);
  const sub = m?.sub?.code ?? letters(subcategory);
  return [g, sub].filter(Boolean).join('-');
}

export const groupStyle = (category?: string | null) => {
  const g = findTaxonomy(category)?.group;
  return { icon: (g?.icon ?? 'pricetag') as Icon, color: g?.color ?? '#A0A0B8' };
};
