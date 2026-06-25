-- Add program column to Positions for program-specific coordinator positions.
-- NULL = position applies to the whole department (Governor, VP, etc.)
-- Non-null = position is for a specific program (e.g. 'BS Computer Science')
ALTER TABLE public."Positions" ADD COLUMN program text;
