import { expect, it } from 'vitest';
import { renderMapPreview } from '../src/ui/CampaignMap';
import type { LevelCardModel } from '../src/ui/UI';

it('renders expedition ratings without a negative repeat count', () => {
  const card = {difficulty:10,challenge:null,locked:false,bestTime:null,region:'South',missionLabel:'Tour',name:'Expedition',subtitle:'',recommended:'4x4',id:'review'} as unknown as LevelCardModel;
  expect(() => renderMapPreview(card, true)).not.toThrow();
  expect(renderMapPreview(card, true)).toContain('Route difficulty 10');
});
