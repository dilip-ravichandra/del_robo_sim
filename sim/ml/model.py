"""
DeliveryBot Navigation Model (PyTorch)

Multi-task neural network that learns two things simultaneously:

  Task 1 — Object Detection
    For each of the 24 LIDAR rays, classify what was hit:
      0 = nothing   1 = building   2 = vehicle
      3 = pedestrian              4 = bike

  Task 2 — Path Optimisation
    Given sensor context + goal direction, output the best
    (dx, dy) movement direction — learned from A* demonstrations.

Architecture
------------
  Input  (26)  : [lidar_dist × 24,  goal_cos,  goal_sin]
  Encoder      : Linear(26→64) → BN → ReLU → Dropout(0.2)
                 Linear(64→32) → ReLU
  Det head     : Linear(32→48) → ReLU → Linear(48 → 24×5)   → view(24,5)
  Path head    : Linear(32→16) → ReLU → Linear(16→2) → Tanh
"""

import torch
import torch.nn as nn

N_RAYS     = 24
N_CLASSES  = 5          # none / building / vehicle / pedestrian / bike
INPUT_SIZE = N_RAYS + 2  # 26


class NavModel(nn.Module):

    def __init__(self):
        super().__init__()

        self.encoder = nn.Sequential(
            nn.Linear(INPUT_SIZE, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
        )

        # Per-ray obstacle classification  →  (batch, 24, 5)
        self.detection_head = nn.Sequential(
            nn.Linear(32, 48),
            nn.ReLU(),
            nn.Linear(48, N_RAYS * N_CLASSES),
        )

        # Optimal movement direction  →  (batch, 2)  in [-1, 1]
        self.path_head = nn.Sequential(
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Linear(16, 2),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor):
        """
        Parameters
        ----------
        x : (batch, 26)

        Returns
        -------
        det  : (batch, 24, 5)  — raw logits per ray per class
        path : (batch, 2)      — normalised direction in [-1, 1]
        """
        enc  = self.encoder(x)
        det  = self.detection_head(enc).view(-1, N_RAYS, N_CLASSES)
        path = self.path_head(enc)
        return det, path
