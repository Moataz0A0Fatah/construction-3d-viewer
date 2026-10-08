export interface Topic {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  modelUrl: string;
  sheetUrl?: string;
  dwgUrl?: string;
}

export const topics: Topic[] = [
  {
    id: 'bearing-walls',
    title: 'Bearing Walls System',
    description: 'Construction of load-bearing walls and their connections.',
    thumbnailUrl: '/thumbnails/bearing_walls.jpg',
    modelUrl: '/models/bearing_walls.glb',
    sheetUrl: '/sheets/bearing_walls.pdf',
    dwgUrl: '/dwg/bearing_walls.dwg'
  },
  {
    id: 'floor1',
    title: 'First Floor',
    description: 'Walls, columns, doors, and windows for level 1.',
    thumbnailUrl: '/thumbnails/floor1.jpg',
    modelUrl: '/models/floor1.glb',
    sheetUrl: '/sheets/floor1.pdf',
    dwgUrl: '/dwg/floor1.dwg'
  },
  {
    id: 'floor2',
    title: 'Second Floor',
    description: 'Level 2 layout with structural elements.',
    thumbnailUrl: '/thumbnails/floor2.jpg',
    modelUrl: '/models/floor2.glb',
    sheetUrl: '/sheets/floor2.pdf',
    dwgUrl: '/dwg/floor2.dwg'
  },
  {
    id: 'roof',
    title: 'Roof Plan',
    description: 'Roof framing and waterproofing layers.',
    thumbnailUrl: '/thumbnails/roof.jpg',
    modelUrl: '/models/roof.glb',
    sheetUrl: '/sheets/roof.pdf',
    dwgUrl: '/dwg/roof.dwg'
  }
];