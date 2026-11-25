/**
 * What a teacher is allowed to see.
 *
 * The bug this replaced: a teacher with two groups opened "Writing to mark"
 * and got every writing paper in the school. The scoping was by organisation,
 * which for a one-school deployment is no scoping at all.
 *
 * So the cases that matter here are the refusals, and in particular the three
 * that are easy to get backwards: no groups is not the same as no scoping, a
 * paper in her class is not the same as a paper her students sat, and a student
 * in her class is not the same as a student in her group.
 */
import { teacherScope, classInScope, studentInScope } from '../src/data/teacherScope.js'

let pass = 0
let fail = 0
const ok = (what, cond) => { if (cond) { pass++ } else { fail++; console.log(`  FAIL  ${what}`) } }
const eq = (what, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else { fail++; console.log(`  FAIL  ${what}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`) }
}

// Lilias takes two groups. Both sit in 5B; 5A and 6A are somebody else's, and
// Nina is in 5B but in the group Lilias does not take.
const GROUPS = [
  { id: 'grp-a', classId: 'cls-5b', studentIds: ['s1', 's2'] },
  { id: 'grp-b', classId: 'cls-5b', studentIds: ['s3'] },
  { id: 'grp-c', classId: 'cls-5b', studentIds: ['nina'] },
  { id: 'grp-d', classId: 'cls-5a', studentIds: ['s9'] },
  { id: 'grp-e', classId: 'cls-6a', studentIds: ['s10'] },
]
const lilias = teacherScope(GROUPS, ['grp-a', 'grp-b'])

// --- teacherScope: who and what the groups add up to ---
{
  eq('the students of every group she holds are hers',
    [...lilias.studentIds].sort(), ['s1', 's2', 's3'])
  eq('two groups in one class are one class',
    [...lilias.classIds], ['cls-5b'])
  eq('groups she does not hold contribute nobody',
    lilias.studentIds.has('nina') || lilias.studentIds.has('s9'), false)

  const both = teacherScope(GROUPS, ['grp-a', 'grp-e'])
  eq('a teacher across two classes gets both', [...both.classIds].sort(), ['cls-5b', 'cls-6a'])

  eq('an id with no group behind it is ignored rather than throwing',
    [...teacherScope(GROUPS, ['grp-nope']).studentIds], [])
  eq('ids are compared as strings, so a numeric group id still matches',
    [...teacherScope([{ id: 7, classId: 'c', studentIds: [1] }], ['7']).studentIds], ['1'])
  eq('a group with no students yet is still a class she can see',
    [...teacherScope([{ id: 'g', classId: 'c' }], ['g']).classIds], ['c'])
  ok('no groups at all is a scope that admits nothing, not an absent scope',
    teacherScope(GROUPS, []) !== null && teacherScope(GROUPS, []).studentIds.size === 0)
  eq('no groupIds given is no scope - an administrator', teacherScope(GROUPS, null), null)
  eq('undefined is no scope too, so an old call site is not silently blinded',
    teacherScope(GROUPS, undefined), null)
  eq('there being no groups in the school at all does not throw',
    [...teacherScope(null, ['grp-a']).studentIds], [])
}

// --- classInScope: which papers may be listed ---
{
  ok('a paper set in her class is hers to mark', classInScope(lilias, 'cls-5b'))
  ok('a paper set in another class is not', !classInScope(lilias, 'cls-6a'))
  ok('a paper belonging to no class is refused, not shared with everyone',
    !classInScope(lilias, null))
  ok('a paper with an empty class is refused as well', !classInScope(lilias, ''))
  ok('an administrator sees a paper in any class', classInScope(null, 'cls-6a'))
  ok('an administrator sees an unplaced paper too', classInScope(null, null))
  ok('a teacher with no groups sees no paper at all',
    !classInScope(teacherScope(GROUPS, []), 'cls-5b'))
}

// --- studentInScope: whose writing may be read ---
{
  ok('a student in her group', studentInScope(lilias, 's1'))
  ok('a student in her class but another teacher’s group is refused - the class is the whole cohort, the group is what she took',
    !studentInScope(lilias, 'nina'))
  ok('a student in another class is refused', !studentInScope(lilias, 's9'))
  ok('an attempt with no student on it is refused', !studentInScope(lilias, undefined))
  ok('an administrator reads any student', studentInScope(null, 'nina'))
  ok('a teacher with no groups reads nobody',
    !studentInScope(teacherScope(GROUPS, []), 's1'))
}

console.log(`${pass} pass, ${fail} fail`)
if (fail) process.exit(1)
