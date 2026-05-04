"""
DeliveryBot ? Navigation model training script.

Steps
-----
1. Generate (or reload cached) 20 000 synthetic scenarios
2. Train a multi-task neural network for 40 epochs
3. Save the best checkpoint to  sim/ml/nav_model.pt

Usage
-----
  # From the project root:
  pip install -r sim/ml/requirements_ml.txt
  python sim/ml/train.py

  # Re-use already generated data (skip slow data-gen step):
  python sim/ml/train.py --cached
"""

import sys
import os
import argparse
import time

# -- Path setup --------------------------------------------------------
_ML_DIR  = os.path.dirname(os.path.abspath(__file__))
_SIM_DIR = os.path.dirname(_ML_DIR)
for p in (_SIM_DIR, _ML_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset, random_split

from ml.data_generator import generate, load, DATA_PATH, N_SCENARIOS
from ml.model import NavModel

MODEL_PATH = os.path.join(_ML_DIR, "nav_model.pt")

# -- Hyper-parameters --------------------------------------------------
EPOCHS = 40
BATCH  = 256
LR     = 1e-3
SPLIT  = 0.85   # train fraction


# -- Training ----------------------------------------------------------

def train(use_cached: bool = False):
    # -- 1. Data -------------------------------------------------------
    if use_cached and os.path.exists(DATA_PATH):
        print(f"Loading cached data from {DATA_PATH}")
        X, Y_det, Y_path = load()
    else:
        print(f"Generating {N_SCENARIOS} training scenarios...")
        t0 = time.time()
        X, Y_det, Y_path = generate(n=N_SCENARIOS)
        print(f"  done in {time.time() - t0:.1f}s")

    Xt      = torch.tensor(X)
    Ydt     = torch.tensor(Y_det)
    Ypt     = torch.tensor(Y_path)

    dataset  = TensorDataset(Xt, Ydt, Ypt)
    n_train  = int(SPLIT * len(dataset))
    n_val    = len(dataset) - n_train
    train_ds, val_ds = random_split(dataset, [n_train, n_val],
                                    generator=torch.Generator().manual_seed(42))

    train_loader = DataLoader(train_ds, batch_size=BATCH, shuffle=True,  num_workers=0)
    val_loader   = DataLoader(val_ds,   batch_size=BATCH, shuffle=False, num_workers=0)

    # -- 2. Model + optimiser ------------------------------------------
    device  = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model   = NavModel().to(device)
    opt     = torch.optim.Adam(model.parameters(), lr=LR)
    sched   = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=EPOCHS, eta_min=1e-5)
    det_fn  = nn.CrossEntropyLoss()
    path_fn = nn.MSELoss()

    print(f"\nDevice : {device}")
    print(f"Train  : {n_train}   Val : {n_val}")
    print(f"Params : {sum(p.numel() for p in model.parameters()):,}")
    print(f"\n{'Epoch':>5}  {'Train':>8}  {'Val':>8}  {'Det-Acc':>8}  {'Path-MSE':>10}")
    print("-" * 50)

    best_val = float("inf")

    for epoch in range(1, EPOCHS + 1):
        # -- train ----------------------------------------------------
        model.train()
        train_loss = 0.0
        for xb, ydet, ypath in train_loader:
            xb, ydet, ypath = xb.to(device), ydet.to(device), ypath.to(device)
            opt.zero_grad()
            det_out, path_out = model(xb)
            # CrossEntropy: (N, C, *) -> permute det to (batch, 5, 24)
            loss = (0.5 * det_fn(det_out.permute(0, 2, 1), ydet)
                  + 0.5 * path_fn(path_out, ypath))
            loss.backward()
            opt.step()
            train_loss += loss.item() * len(xb)
        sched.step()

        # -- validate -------------------------------------------------
        model.eval()
        val_loss  = 0.0
        correct   = 0
        total     = 0
        path_mse  = 0.0
        with torch.no_grad():
            for xb, ydet, ypath in val_loader:
                xb, ydet, ypath = xb.to(device), ydet.to(device), ypath.to(device)
                det_out, path_out = model(xb)
                loss = (0.5 * det_fn(det_out.permute(0, 2, 1), ydet)
                      + 0.5 * path_fn(path_out, ypath))
                val_loss  += loss.item() * len(xb)
                preds      = det_out.argmax(dim=-1)
                correct   += (preds == ydet).sum().item()
                total     += ydet.numel()
                path_mse  += path_fn(path_out, ypath).item() * len(xb)

        tl   = train_loss / n_train
        vl   = val_loss   / n_val
        acc  = 100.0 * correct / total
        pmse = path_mse / n_val
        tag  = "  ? best" if vl < best_val else ""

        print(f"{epoch:>5}  {tl:>8.4f}  {vl:>8.4f}  {acc:>7.1f}%  {pmse:>10.5f}{tag}")

        if vl < best_val:
            best_val = vl
            torch.save(model.state_dict(), MODEL_PATH)

    print(f"\n{'-'*50}")
    print(f"Best val loss : {best_val:.4f}")
    print(f"Model saved   -> {MODEL_PATH}")
    print("\nTo use the model in the simulation:")
    print("  from ml.predictor import get_predictor")
    print("  pred = get_predictor()")
    print("  detections = pred.detect_objects(lidar_scan)")
    print("  dx, dy     = pred.optimize_direction(lidar_scan, goal_cos, goal_sin)")


# -- Entry point -------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train DeliveryBot nav model")
    parser.add_argument("--cached", action="store_true",
                        help="Re-use existing training_data.npz instead of regenerating")
    args = parser.parse_args()
    train(use_cached=args.cached)
