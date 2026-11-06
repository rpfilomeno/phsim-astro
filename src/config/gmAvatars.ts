import kafraAteLeina from '../assets/avatars/kafra_ate_leina.png';
import bpoAssassinCross from '../assets/avatars/bpo_assassin_cross.png';
import agriLordBlacksmith from '../assets/avatars/agri_lord_blacksmith.png';
import madoMechanicJeepneyDriver from '../assets/avatars/mado_mechanic_jeepney_driver.png';
import pPopIdolDancer from '../assets/avatars/p_pop_idol_dancer.png';
import barangayTanodKnight from '../assets/avatars/barangay_tanod_knight.png';
import commonwealthNoviceCommuter from '../assets/avatars/commonwealth_novice_commuter.png';
import haloHaloAlchemistProfessor from '../assets/avatars/halo_halo_alchemist_professor.png';
import motorcycleCourierPecoRider from '../assets/avatars/motorcycle_courier_peco_rider.png';
import supremeJudicialGmArbiter from '../assets/avatars/supreme_judicial_gm_arbiter.png';

export const gmAvatars = {
  kafra_ate_leina: kafraAteLeina,
  bpo_assassin_cross: bpoAssassinCross,
  agri_lord_blacksmith: agriLordBlacksmith,
  mado_mechanic_jeepney_driver: madoMechanicJeepneyDriver,
  p_pop_idol_dancer: pPopIdolDancer,
  barangay_tanod_knight: barangayTanodKnight,
  commonwealth_novice_commuter: commonwealthNoviceCommuter,
  halo_halo_alchemist_professor: haloHaloAlchemistProfessor,
  motorcycle_courier_peco_rider: motorcycleCourierPecoRider,
  supreme_judicial_gm_arbiter: supremeJudicialGmArbiter,
} as const;

export type GmAvatarKey = keyof typeof gmAvatars;
