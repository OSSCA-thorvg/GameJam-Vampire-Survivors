"""Issue84's fixed, full-cycle temporal sampling; never a visual pose selector."""

SOURCE_STATES = {'idle': {'frames': 8, 'fps': 4, 'durationSeconds': 2},
                 'move': {'frames': 8, 'fps': 12, 'durationSeconds': 2 / 3}}
NATIVE_STATES = {'idle': {'frames': 4, 'fps': 2, 'durationSeconds': 2},
                 'move': {'frames': 8, 'fps': 12, 'durationSeconds': 2 / 3}}
FRAME_SELECTION = {'idle': [0, 2, 4, 6], 'move': list(range(8))}


def sampling_contract():
    return {'sourceStates': SOURCE_STATES, 'nativeStates': NATIVE_STATES,
            'frameSelection': FRAME_SELECTION, 'sourcePoseCount': 16, 'nativePoseCount': 12}


def ordered_poses(states):
    return [(state, index) for state in ['idle', 'move'] for index in range(states[state]['frames'])]


def native_ancestry():
    return [(state, target, source) for state in ['idle', 'move']
            for target, source in enumerate(FRAME_SELECTION[state])]
