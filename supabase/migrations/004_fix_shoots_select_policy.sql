-- La lecture d'un shooting ne doit pas passer par une sous-requête sur la même ligne :
-- sinon INSERT ... RETURNING échoue pour les créateurs (la ligne en cours d'insertion est invisible à la fonction).
alter policy shoots_select on public.shoots
  using (public.is_staff() or created_by = auth.uid() or (project_id is not null and public.in_project(project_id)));
