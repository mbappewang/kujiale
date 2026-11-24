import { describe, expect, it } from 'vitest';
import {
  circleVsSegmentPushback,
  formatAreaSqm,
  formatCurrencyAUD,
  formatMetres,
  obbOverlap2D,
  pointInPolygon,
  polygonAreaSqm,
  UndoRedoStack,
} from './index';

describe('shared locale & geometry utilities', () => {
  it('formats Australian metric dimensions and AUD currency properly', () => {
    expect(formatMetres(4.5, 'm')).toBe('4.50 m');
    expect(formatMetres(4.5, 'mm')).toBe('4,500 mm');
    expect(formatAreaSqm(25.65)).toBe('25.7 m²');
    expect(formatCurrencyAUD(3290)).toContain('3,290');
  });

  it('computes polygon area and point-in-polygon accurately', () => {
    const poly = [
      { x: -6.5, z: -6.0 },
      { x: -0.8, z: -6.0 },
      { x: -0.8, z: -1.5 },
      { x: -6.5, z: -1.5 },
    ];
    expect(polygonAreaSqm(poly)).toBeCloseTo(25.65, 4);
    expect(pointInPolygon({ x: -3.0, z: -3.0 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 2.0, z: -3.0 }, poly)).toBe(false);
  });

  it('detects rotated OBB furniture collisions and capsule wall pushback', () => {
    const sofa = { center: { x: 0, z: 0 }, halfWidth: 1.15, halfDepth: 0.48, rotationY: 0 };
    const tableOverlap = { center: { x: 0.5, z: 0.4 }, halfWidth: 0.65, halfDepth: 0.35, rotationY: 0.4 };
    const tableClear = { center: { x: 0, z: 1.4 }, halfWidth: 0.65, halfDepth: 0.35, rotationY: 0 };

    expect(obbOverlap2D(sofa, tableOverlap)).toBe(true);
    expect(obbOverlap2D(sofa, tableClear)).toBe(false);

    const pushed = circleVsSegmentPushback(
      { x: 0, z: 0.15 },
      0.32,
      { x: -3, z: 0 },
      { x: 3, z: 0 },
      0.12,
    );
    expect(pushed.z).toBeCloseTo(0.44, 3);
  });

  it('manages undo/redo state immutably', () => {
    const history = new UndoRedoStack<{ walls: number }>(10);
    let current = { walls: 4 };
    history.record(current);
    current = { walls: 5 };
    expect(history.canUndo).toBe(true);

    const undone = history.undo(current);
    expect(undone?.walls).toBe(4);
    expect(history.canRedo).toBe(true);

    const redone = history.redo(undone!);
    expect(redone?.walls).toBe(5);
  });
});
