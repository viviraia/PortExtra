/** Side-effect module: registers every boss factory. Imported by GameScene. */
import { registerBoss } from './index';
import { createWarden } from './warden';
import { createMatriarch } from './matriarch';
import { createArchivist } from './archivist';
import { createHollowKing } from './hollowKing';

registerBoss('warden', createWarden);
registerBoss('gargoyle_matriarch', createMatriarch);
registerBoss('archivist', createArchivist);
registerBoss('hollow_king', createHollowKing);
