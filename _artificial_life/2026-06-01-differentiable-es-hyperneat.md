---
title: Differentiable ES-HyperNEAT
date: 2026-06-01
math: true
---

Es-HyperNEAT uses a [Compositional Pattern-Producing Network (CPPN)](https://en.wikipedia.org/wiki/Compositional_pattern-producing_network) to learn where to place neural network nodes and the weights to apply to their edges.

The CPPN $f$ is a composition of some set of canoncial functions, and is of the form.

$$
f(x_0,y_0,x_1,y_1) = w
$$

The $(0,-1,x,y)$ space is considered a node centric *substrate* in ES-HyperNEAT, in this case centered arbitrarily on $(0,-1)$ in order to construct the 2-D substrate. The 2-dimensional substrate is searched, using a recursive [Quadtree](https://en.wikipedia.org/wiki/Quadtree) algorithm, to identify areas of high complexity (which corresponds to areas of high variance in $w$). 

A trivial example of a CPPN:
 
```
graph LR
    subgraph Input Layer
        x0["x_0"]
        y0["y_0"]
        x1["x_1"]
        y1["y_1"]
    end

    subgraph Hidden Layer
        h1["sin"]
        h2["cos"]
        h3["Gaussian"]
    end

    subgraph Output Layer
        w["w"]
    end

    %% Connections from x0
    x0 --> h1
    x0 --> h2
    x0 --> h3

    %% Connections from y0
    y0 --> h1
    y0 --> h2
    y0 --> h3

    %% Connections from x1
    x1 --> h1
    x1 --> h2
    x1 --> h3

    %% Connections from y1
    y1 --> h1
    y1 --> h2
    y1 --> h3

    %% Connections to Output
    h1 --> w
    h2 --> w
    h3 --> w
```

$$\mathbf{x} = \begin{pmatrix} x_0 \\ y_0 \\ x_1 \\ y_1 \end{pmatrix}$$
$$h_1 = \sin(\mathbf{w}_{h1}^T \mathbf{x} + b_{h1})$$
$$h_2 = \cos(\mathbf{w}_{h2}^T \mathbf{x} + b_{h2})$$
$$h_3 = \exp(-(\mathbf{w}_{h3}^T \mathbf{x} + b_{h3})^2)$$
$$w = w_{o1}h_1 + w_{o2}h_2 + w_{o3}h_3 + b_o$$

With such a CPPN, the $f(0,-1,x,y)$ substrate might look like:

I'm positing that a 2-dimensional substrate is quite limiting. 

This is still a WIP, why are you here. 