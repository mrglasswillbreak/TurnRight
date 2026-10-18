import { Suspense } from 'react';
import { EditorSettings } from './EditorSettings';
import { campusUrl, lasuCampus } from './campus-context';
import { CampusWorkspace, SourceUpdates } from './editor-workspace-shared';

import { EditorGisPanel } from './EditorGisPanel';
import type { EditorReviewPanelBindings } from './useEditorReviewPanel';
import type { EditorSelectionBindings } from './useEditorSelection';
import type { EditorSessionStateBindings } from './useEditorSessionState';
import type { EditorSynchronizationBindings } from './useEditorSynchronization';
import type { EditorTasksBindings } from './useEditorTasks';
type Props = Pick<
  EditorSessionStateBindings,
  | 'dark'
  | 'appearance'
  | 'onAppearance'
  | 'state'
  | 'refresh'
  | 'owner'
  | 'workspace'
  | 'signIn'
  | 'surveyRecording'
  | 'layout'
  | 'tab'
  | 'setTab'
  | 'setSelected'
  | 'threeD'
  | 'simple3D'
  | 'setSimple3D'
  | 'settingsTrigger'
  | 'opacity'
  | 'setOpacity'
  | 'busy'
  | 'setReview'
  | 'mapRef'
  | 'setRepairFocus'
  | 'gisSources'
  | 'setGisSources'
  | 'validation'
> &
  Pick<EditorSelectionBindings, 'select'> &
  Pick<EditorSynchronizationBindings, 'action'> &
  Pick<EditorTasksBindings, 'selectSection'> &
  Pick<EditorReviewPanelBindings, 'reviewPanel'>;
export function EditorTeamPanels(props: Props) {
  const {
    dark,
    appearance,
    onAppearance,
    state,
    refresh,
    owner,
    workspace,
    signIn,
    surveyRecording,
    layout,
    tab,
    setTab,
    threeD,
    simple3D,
    setSimple3D,
    settingsTrigger,
    opacity,
    setOpacity,
    busy,
    setReview,
    mapRef,
    validation,
    action,
    selectSection,
    reviewPanel,
  } = props;
  return (
    <>
      <EditorGisPanel {...props} />
      {tab === 'campuses' && (
        <Suspense
          fallback={<p className="campus-workspace">Opening campuses…</p>}
        >
          <CampusWorkspace
            currentData={validation.data}
            owner={owner}
            current={state.campus || lasuCampus}
            dark={dark}
            onClose={() => setTab('map')}
            onSwitch={async (campus) => {
              if (
                workspace.unfinished ||
                workspace.roofDraft ||
                surveyRecording
              )
                throw new Error(
                  'Finish the current edit or pause recording before switching campuses.',
                );
              if (!(await workspace.flush()))
                throw new Error(
                  'Resolve pending saves before switching campuses. Your local edits are retained.',
                );
              location.assign(campusUrl('/admin', campus.slug));
            }}
            onReview={async () => {
              await refresh();
              setTab('changes');
            }}
          />
        </Suspense>
      )}
      {tab === 'settings' && (
        <EditorSettings
          onResetLayout={layout.reset}
          onMemberships={
            state.capabilities?.capabilities.includes('manage')
              ? () => selectSection('members')
              : undefined
          }
          appearance={appearance}
          dark={dark}
          onAppearance={onAppearance}
          map={mapRef.current}
          threeD={threeD}
          simple={simple3D}
          onSimple={setSimple3D}
          opacity={opacity}
          onOpacity={setOpacity}
          onClose={() => {
            setTab('map');
            settingsTrigger.current?.focus();
          }}
        />
      )}
      {tab === 'changes' && (
        <Suspense fallback={<p>Opening source updates…</p>}>
          <SourceUpdates
            data={validation.data}
            capabilities={state.capabilities}
            busy={busy}
            extras={
              (state.campus?.slug || 'lasu') === 'lasu'
                ? reviewPanel
                : undefined
            }
            beforeDecision={async () => {
              if (
                workspace.unfinished ||
                workspace.roofDraft ||
                workspace.status === 'Conflict'
              )
                throw new Error(
                  'Finish the current edit and resolve conflicts before applying source decisions.',
                );
              if (!(await workspace.flush()))
                throw new Error(
                  workspace.error || 'Save or repair the draft first.',
                );
            }}
            onRefresh={async () => {
              if (!(await workspace.flush()))
                throw new Error(
                  'Save or repair local edits, then refresh source updates.',
                );
              workspace.reconcile(await refresh(), true);
            }}
            onImports={() => setTab('campuses')}
            onSignIn={signIn}
            action={action}
            onFocus={setReview}
            mapRef={mapRef}
          />
        </Suspense>
      )}
    </>
  );
}
